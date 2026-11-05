package com.brick.safety.beta

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.UserManager
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.brick.safety.BuildConfig
import com.brick.safety.location.BrickLocationService
import com.brick.safety.managed.BrickDeviceAdminReceiver
import com.brick.safety.reliability.RecoveryScheduler
import java.util.concurrent.TimeUnit

/**
 * Phase 8 fail-closed lifecycle for disposable Device Owner betas.
 *
 * Retirement is intentionally monotonic:
 * ACTIVE -> DISARMED -> MANAGEMENT_RELEASED -> UNINSTALL_REQUESTED.
 * Once DISARMED is durably committed, normal Brick runtime is never allowed to start again.
 */
object BetaSafety {
    private const val PREFS = "brick_beta_safety"
    private const val KEY_STAGE = "retirement_stage"
    private const val KEY_RETIRE_REASON = "retire_reason"
    private const val KEY_RETIRED_AT = "retired_at"
    private const val KEY_STAGE_UPDATED_AT = "stage_updated_at"
    private const val LEGACY_KEY_RETIRED = "retired"
    private const val EXPIRY_WORK = "brick-beta-expiry"

    enum class RetirementStage {
        ACTIVE,
        DISARMED,
        MANAGEMENT_RELEASED,
        UNINSTALL_REQUESTED
    }

    data class ReleaseResult(
        val ownerBefore: Boolean,
        val ownerAfter: Boolean,
        val activeAdminAfter: Boolean,
        val error: String? = null
    ) {
        val released: Boolean
            get() = !ownerAfter && !activeAdminAfter && error == null
    }

    fun expiryEpochMs(): Long = BuildConfig.BRICK_BETA_EXPIRY_EPOCH_MS

    fun isExpired(nowMs: Long = System.currentTimeMillis()): Boolean {
        return BuildConfig.BRICK_BETA && nowMs >= expiryEpochMs()
    }

    fun retirementStage(context: Context): RetirementStage {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val stored = prefs.getString(KEY_STAGE, null)
        if (stored != null) {
            return runCatching { RetirementStage.valueOf(stored) }
                .getOrDefault(RetirementStage.DISARMED)
        }
        // Safe migration from the Phase 7 boolean. Never revive a beta that was already retired.
        return if (prefs.getBoolean(LEGACY_KEY_RETIRED, false)) {
            RetirementStage.DISARMED
        } else {
            RetirementStage.ACTIVE
        }
    }

    fun isRetired(context: Context): Boolean = retirementStage(context) != RetirementStage.ACTIVE

    fun isOperational(context: Context, nowMs: Long = System.currentTimeMillis()): Boolean {
        if (retirementStage(context) != RetirementStage.ACTIVE) return false
        return !isExpired(nowMs)
    }

    /**
     * Called from process/bootstrap entry points. Expiry begins retirement; any non-active stage
     * stays fail-closed and may resume management release, but never resumes Brick runtime.
     */
    fun enforceStartup(context: Context): Boolean {
        val app = context.applicationContext
        if (retirementStage(app) == RetirementStage.ACTIVE && isExpired()) {
            beginRetirement(app, "automatic_expiry")
        }

        val stage = retirementStage(app)
        if (stage != RetirementStage.ACTIVE) {
            shutdownRuntime(app)
            if (stage == RetirementStage.DISARMED) {
                // Idempotent recovery: a reboot/process kill between stages resumes release only.
                resumeManagementVerification(app)
            }
            return false
        }

        if (BuildConfig.BRICK_BETA) scheduleExpiry(app)
        return true
    }

    private val verificationRunning = java.util.concurrent.atomic.AtomicBoolean(false)
    private val verificationStopped = java.util.concurrent.atomic.AtomicBoolean(false)
    @Volatile private var verificationThread: Thread? = null

    /** App/boot bootstrap must return to main so Android can deliver admin-removal callbacks. */
    private fun resumeManagementVerification(context: Context) {
        val app = context.applicationContext
        synchronized(verificationRunning) {
            if (verificationStopped.get() || com.brick.safety.maintenance.DeprovisionManager.isPostPurge(app) ||
                !verificationRunning.compareAndSet(false, true)) return
            verificationThread = Thread({
                try {
                    repeat(3) {
                        if (verificationStopped.get() || Thread.currentThread().isInterrupted ||
                            com.brick.safety.maintenance.DeprovisionManager.isPostPurge(app) ||
                            retirementStage(app) != RetirementStage.DISARMED) return@Thread
                        if (advanceManagementRelease(app).released) return@Thread
                        Thread.sleep(200L)
                    }
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                } finally { verificationRunning.set(false) }
            }, "brick-management-verification").apply { isDaemon = true; start() }
        }
    }

    /** Permanent purge closes admission and joins the bounded bootstrap verifier before deleting prefs. */
    fun quiesceManagementVerification(): Boolean {
        val thread = synchronized(verificationRunning) {
            verificationStopped.set(true)
            verificationThread?.also { it.interrupt() }
        }
        if (thread === Thread.currentThread()) return false
        thread?.join(5_000L)
        return thread?.isAlive != true
    }

    fun scheduleExpiry(context: Context) {
        val app = context.applicationContext
        if (!BuildConfig.BRICK_BETA || retirementStage(app) != RetirementStage.ACTIVE) return

        val delayMs = (expiryEpochMs() - System.currentTimeMillis()).coerceAtLeast(1_000L)
        val request = OneTimeWorkRequestBuilder<BetaExpiryWorker>()
            .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
            .build()

        WorkManager.getInstance(app).enqueueUniqueWork(
            EXPIRY_WORK,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }

    /** Stage 1. The durable DISARMED write happens before any management privilege is released. */
    fun beginRetirement(context: Context, reason: String): Boolean {
        val app = context.applicationContext
        val current = retirementStage(app)
        if (current != RetirementStage.ACTIVE) {
            shutdownRuntime(app)
            return true
        }

        val now = System.currentTimeMillis()
        val committed = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_STAGE, RetirementStage.DISARMED.name)
            .putBoolean(LEGACY_KEY_RETIRED, true)
            .putString(KEY_RETIRE_REASON, reason.take(80))
            .putLong(KEY_RETIRED_AT, now)
            .putLong(KEY_STAGE_UPDATED_AT, now)
            .commit()

        // Never release Device Owner or disable Core if Android failed to durably record the
        // fail-closed state first.
        if (!committed) return false
        shutdownRuntime(app)
        return true
    }

    /**
     * Stage 2. Safe to call repeatedly. For the Device Owner path, Android's clearDeviceOwnerApp()
     * call is synchronous at the system-server boundary: a successful return means the owner and
     * its active admin were removed. We therefore do not make the durable stage transition depend
     * on an immediate second read that can transiently disagree with the just-completed operation.
     * The legacy active-admin-only fallback remains read-back gated because removeActiveAdmin() is
     * explicitly asynchronous.
     */
    fun advanceManagementRelease(context: Context): ReleaseResult {
        val app = context.applicationContext
        if (retirementStage(app) == RetirementStage.ACTIVE) {
            return ownerSnapshot(app, "retirement_not_disarmed")
        }

        shutdownRuntime(app)
        val result = releaseDeviceOwner(app)
        if (result.released) {
            persistForwardStage(app, RetirementStage.MANAGEMENT_RELEASED)
        }
        return result
    }

    /** Stage 3. Android owns package deletion; Brick only requests the system uninstall UI. */
    fun requestUninstall(context: Context): Boolean {
        val app = context.applicationContext
        if (retirementStage(app) == RetirementStage.ACTIVE) return false

        val released = advanceManagementRelease(app)
        if (!released.released) return false
        if (!persistForwardStage(app, RetirementStage.UNINSTALL_REQUESTED)) return false

        openUninstallScreen(app)
        return true
    }

    /** Emergency escape independent of the staged retirement UI. Never wipes user data/the phone. */
    @Suppress("DEPRECATION")
    fun releaseDeviceOwner(context: Context): ReleaseResult {
        val app = context.applicationContext
        val dpm = app.getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(app, BrickDeviceAdminReceiver::class.java)
        val ownerBefore = try { dpm.isDeviceOwnerApp(app.packageName) } catch (_: Exception) {
            return ReleaseResult(true, true, true, "owner_state_unreadable")
        }
        var failure: Throwable? = null

        if (ownerBefore) {
            // Clean up restrictions created by older Brick betas before relinquishing ownership.
            runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION) }
            runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME) }

            runCatching { dpm.clearDeviceOwnerApp(app.packageName) }
                .onFailure { failure = it }

            // A successful API call alone is not an independent postcondition.
            // Read back BOTH owner and active-admin state below; retry safely if still settling.

        } else {
            val active = runCatching { dpm.isAdminActive(admin) }.getOrDefault(false)
            if (active) {
                // removeActiveAdmin() is asynchronous, so this path must still prove convergence
                // with the read-back below before MANAGEMENT_RELEASED may be committed.
                runCatching { dpm.removeActiveAdmin(admin) }
                    .onFailure { failure = it }
            }
        }

        // DPMS removes the owner record before its asynchronous admin-removal callback settles.
        // AOSP evidence showed a ~70ms gap: one immediate read correctly refused release but left
        // the durable retirement state DISARMED forever. Wait briefly for BOTH real postconditions;
        // never substitute an API return value for verification or wait indefinitely at startup.
        val deadline = android.os.SystemClock.elapsedRealtime() + 1_500L
        var ownerAfter: Boolean
        var activeAdminAfter: Boolean
        do {
            ownerAfter = runCatching { dpm.isDeviceOwnerApp(app.packageName) }.getOrDefault(true)
            activeAdminAfter = runCatching { dpm.isAdminActive(admin) }.getOrDefault(true)
            if ((!ownerAfter && !activeAdminAfter) || failure != null || android.os.SystemClock.elapsedRealtime() >= deadline) break
            try { Thread.sleep(50L) } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
                return ReleaseResult(ownerBefore, ownerAfter, activeAdminAfter, "verification_interrupted")
            }
        } while (true)
        return ReleaseResult(ownerBefore, ownerAfter, activeAdminAfter, failure?.javaClass?.simpleName)
    }

    /** Compatibility wrapper for older call sites; the implementation is now staged and monotonic. */
    fun selfDestruct(context: Context, reason: String, launchUninstall: Boolean): ReleaseResult {
        if (!beginRetirement(context, reason)) {
            return ownerSnapshot(context.applicationContext, "disarm_state_not_persisted")
        }
        val release = advanceManagementRelease(context)
        if (launchUninstall && release.released) requestUninstall(context)
        return release
    }

    fun openUninstallScreen(context: Context) {
        val app = context.applicationContext
        val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:${app.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { app.startActivity(intent) }
    }

    private fun ownerSnapshot(context: Context, error: String): ReleaseResult {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(context, BrickDeviceAdminReceiver::class.java)
        val owner = runCatching { dpm.isDeviceOwnerApp(context.packageName) }.getOrDefault(false)
        val active = runCatching { dpm.isAdminActive(admin) }.getOrDefault(owner)
        return ReleaseResult(owner, owner, active, error)
    }

    private fun persistForwardStage(context: Context, target: RetirementStage): Boolean {
        val current = retirementStage(context)
        if (current.ordinal >= target.ordinal) return true
        if (current == RetirementStage.ACTIVE) return false
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_STAGE, target.name)
            .putBoolean(LEGACY_KEY_RETIRED, true)
            .putLong(KEY_STAGE_UPDATED_AT, System.currentTimeMillis())
            .commit()
    }

    /**
     * Disable the direct Core start target, but deliberately keep BootReceiver enabled. The receiver
     * is guarded by enforceStartup() before it can schedule/start Core, and keeping it alive is what
     * lets a reboot/package replacement resume Stage 2 after a crash between retirement stages.
     */
    private fun disableRuntimeComponents(context: Context) {
        runCatching {
            context.packageManager.setComponentEnabledSetting(
                ComponentName(context, BrickLocationService::class.java),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            )
        }
    }

    private fun shutdownRuntime(context: Context) {
        disableRuntimeComponents(context)
        runCatching { context.stopService(Intent(context, BrickLocationService::class.java)) }
        runCatching { RecoveryScheduler.cancelAll(context) }
        runCatching { WorkManager.getInstance(context).cancelUniqueWork(EXPIRY_WORK) }
    }
}
