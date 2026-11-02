package com.brick.safety.reliability

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object RecoveryScheduler {
    private const val PERIODIC_WORK = "brick-periodic-recovery"
    private const val SOON_WORK = "brick-soon-recovery"
    private const val EVIDENCE_SOON_WORK = "brick-evidence-soon-recovery"

    fun ensureScheduled(context: Context) {
        val request = PeriodicWorkRequestBuilder<RecoveryWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.NOT_REQUIRED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK,
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    fun scheduleSoon(context: Context, delaySeconds: Long = 15) {
        val request = OneTimeWorkRequestBuilder<RecoveryWorker>()
            .setInitialDelay(delaySeconds.coerceAtLeast(1), TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            SOON_WORK,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }

    private fun evidenceRequest(delaySeconds: Long) = OneTimeWorkRequestBuilder<EvidenceUploadWorker>()
        .setInitialDelay(delaySeconds.coerceAtLeast(1), TimeUnit.SECONDS)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .build()

    fun scheduleEvidenceSoon(context: Context, delaySeconds: Long = 5) {
        WorkManager.getInstance(context).enqueueUniqueWork(
            EVIDENCE_SOON_WORK,
            ExistingWorkPolicy.KEEP,
            evidenceRequest(delaySeconds)
        )
    }

    fun scheduleEvidenceFollowUp(context: Context, delaySeconds: Long) {
        WorkManager.getInstance(context).enqueueUniqueWork(
            EVIDENCE_SOON_WORK,
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            evidenceRequest(delaySeconds)
        )
    }

    fun cancelAll(context: Context) {
        val workManager = WorkManager.getInstance(context.applicationContext)
        workManager.cancelUniqueWork(PERIODIC_WORK)
        workManager.cancelUniqueWork(SOON_WORK)
        workManager.cancelUniqueWork(EVIDENCE_SOON_WORK)
    }
}
