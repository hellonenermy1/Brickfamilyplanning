package com.brick.safety.reliability

import android.content.Context
import android.os.SystemClock
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.brick.safety.beta.BetaSafety
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.maintenance.DeprovisionManager
import com.brick.safety.maintenance.DeviceRoleStore
import com.brick.safety.maintenance.WifiScheduleManager
import java.util.concurrent.TimeUnit

object RecoveryScheduler {
    private const val PERIODIC_WORK = "brick-periodic-recovery"
    private const val SOON_WORK = "brick-soon-recovery"
    private const val EVIDENCE_SOON_WORK = "brick-evidence-soon-recovery"
    private const val DAILY_CANARY_WORK = "brick-daily-canary"
    private const val DAILY_CANARY_RETEST_WORK = "brick-daily-canary-retest"
    private const val SCREEN_TIME_WORK = "brick-screen-time-summary"
    private const val LEGACY_BETA_EXPIRY_WORK = "brick-beta-expiry"

    private val staticOwnedWorkNames = listOf(
        PERIODIC_WORK,
        SOON_WORK,
        EVIDENCE_SOON_WORK,
        DAILY_CANARY_WORK,
        DAILY_CANARY_RETEST_WORK,
        SCREEN_TIME_WORK,
        LEGACY_BETA_EXPIRY_WORK
    )

    fun ensureScheduled(context: Context) {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return
        if (DeepOffManager.isActive(app) || DeviceRoleStore.role(app) != DeviceRoleStore.Role.CHILD || !BetaSafety.isOperational(app)) {
            cancelAll(app)
            return
        }
        val wm = WorkManager.getInstance(app)
        val recovery = PeriodicWorkRequestBuilder<RecoveryWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.NOT_REQUIRED).build())
            .build()
        wm.enqueueUniquePeriodicWork(PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, recovery)

        val canary = PeriodicWorkRequestBuilder<CanaryWorker>(24, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.NOT_REQUIRED).build())
            .build()
        wm.enqueueUniquePeriodicWork(DAILY_CANARY_WORK, ExistingPeriodicWorkPolicy.KEEP, canary)

        val screenTime = PeriodicWorkRequestBuilder<ScreenTimeWorker>(6, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        wm.enqueueUniquePeriodicWork(SCREEN_TIME_WORK, ExistingPeriodicWorkPolicy.KEEP, screenTime)

        WifiScheduleManager.reschedule(app)
    }

    fun scheduleSoon(context: Context, delaySeconds: Long = 15) {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return
        if (DeepOffManager.isActive(app) || DeviceRoleStore.role(app) != DeviceRoleStore.Role.CHILD || !BetaSafety.isOperational(app)) return
        val request = OneTimeWorkRequestBuilder<RecoveryWorker>()
            .setInitialDelay(delaySeconds.coerceAtLeast(1), TimeUnit.SECONDS).build()
        WorkManager.getInstance(app).enqueueUniqueWork(SOON_WORK, ExistingWorkPolicy.REPLACE, request)
    }

    private fun evidenceRequest(delaySeconds: Long) = OneTimeWorkRequestBuilder<EvidenceUploadWorker>()
        .setInitialDelay(delaySeconds.coerceAtLeast(1), TimeUnit.SECONDS)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()

    fun scheduleEvidenceSoon(context: Context, delaySeconds: Long = 5) {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return
        if (DeepOffManager.isActive(app) || DeviceRoleStore.role(app) != DeviceRoleStore.Role.CHILD || !BetaSafety.isOperational(app)) return
        WorkManager.getInstance(app).enqueueUniqueWork(EVIDENCE_SOON_WORK, ExistingWorkPolicy.KEEP, evidenceRequest(delaySeconds))
    }

    fun scheduleEvidenceFollowUp(context: Context, delaySeconds: Long) {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return
        if (DeepOffManager.isActive(app) || DeviceRoleStore.role(app) != DeviceRoleStore.Role.CHILD || !BetaSafety.isOperational(app)) return
        WorkManager.getInstance(app).enqueueUniqueWork(EVIDENCE_SOON_WORK, ExistingWorkPolicy.APPEND_OR_REPLACE, evidenceRequest(delaySeconds))
    }

    fun cancelAll(context: Context) {
        val app = context.applicationContext
        // Cancellation is performed before PURGE_BRICK. Once purge has committed, do not cause
        // WorkManager/Wi-Fi schedule state to be reopened merely to repeat cancellation.
        if (DeprovisionManager.isPostPurge(app)) return
        val workManager = WorkManager.getInstance(app)
        staticOwnedWorkNames.forEach(workManager::cancelUniqueWork)
        runCatching { WifiScheduleManager.cancelAll(app) }
    }

    /**
     * Deprovision-only barrier. WorkManager cancellation is documented as best effort, so PURGE must
     * not start merely because cancelUniqueWork() was called. We wait for every Brick-owned unique
     * chain's cancellation Operation, prune terminal records, and prove those names have no remaining
     * WorkInfo before deleting Brick's own persistence.
     */
    fun cancelAllAndAwaitForDeprovision(context: Context, timeoutMs: Long = 15_000L): Boolean {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return false
        val workManager = WorkManager.getInstance(app)
        val names = (staticOwnedWorkNames + WifiScheduleManager.workNamesForDeprovision(app)).distinct()
        val deadline = SystemClock.elapsedRealtime() + timeoutMs.coerceAtLeast(1_000L)

        fun remainingMs(): Long = (deadline - SystemClock.elapsedRealtime()).coerceAtLeast(1L)

        return try {
            for (name in names) {
                workManager.cancelUniqueWork(name).result.get(remainingMs(), TimeUnit.MILLISECONDS)
            }

            // The cancellation operation means WorkManager has processed the request, but prove no
            // unfinished Brick work survived before pruning historical terminal rows.
            for (name in names) {
                val infos = workManager.getWorkInfosForUniqueWork(name).get(remainingMs(), TimeUnit.MILLISECONDS)
                if (infos.any { !it.state.isFinished }) return false
            }

            workManager.pruneWork().result.get(remainingMs(), TimeUnit.MILLISECONDS)

            // After prune, no Brick-owned WorkInfo may remain. The WorkManager database itself is
            // AndroidX infrastructure and may remain, but contains no Brick scheduling record.
            names.all { name ->
                workManager.getWorkInfosForUniqueWork(name).get(remainingMs(), TimeUnit.MILLISECONDS).isEmpty()
            }
        } catch (_: Throwable) {
            false
        }
    }
}
