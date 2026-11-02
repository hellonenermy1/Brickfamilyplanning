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
import com.brick.safety.reliability.BootReceiver
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
                advanceManagementRelease(app)
            }
            return false
        }

        if (BuildConfig.BRICK_BETA) scheduleExpiry(app)
        return true
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

        // Never release Device Owner or disable runtime components if Android failed to durably
        // record the fail-closed state first.
        if (!committed) return false
        shutdownRuntime(app)
        return true
    }

    /**
     * Stage 2. Safe to call repeatedly. MANAGEMENT_RELEASED is persisted only after Android reports
     * that Brick is neither Device Owner nor active admin.
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
        val ownerBefore = runCatching { dpm.isDeviceOwnerApp(app.packageName) }.getOrDefault(false)
        var failure: Throwable? = null

        if (ownerBefore) {
            // Clean up restrictions created by older Brick betas before relinquishing ownership.
            runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION) }
            runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME) }
            runCatching { dpm.clearDeviceOwnerApp(app.packageName) }
                .onFailure { failure = it }
        } else {
            val active = runCatching { dpm.isAdminActive(admin) }.getOrDefault(false)
            if (active) {
                runCatching { dpm.removeActiveAdmin(admin) }
                    .onFailure { failure = it }
            }
        }

        val ownerAfter = runCatching { dpm.isDeviceOwnerApp(app.packageName) }.getOrDefault(ownerBefore)
        val activeAdminAfter = runCatching { dpm.isAdminActive(admin) }.getOrDefault(ownerAfter)
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
     * Package-manager kill switch for the two Android entry points that can directly restart Core.
     * This closes the race where a start/broadcast was already queued when Stage 1 was committed.
     * Diagnostics stays enabled so Stage 2/3 can still be completed locally.
     */
    private fun disableRuntimeComponents(context: Context) {
        val pm = context.packageManager
        listOf(
            ComponentName(context, BrickLocationService::class.java),
            ComponentName(context, BootReceiver::class.java)
        ).forEach { component ->
            runCatching {
                pm.setComponentEnabledSetting(
                    component,
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP
                )
            }
        }
    }

    private fun shutdownRuntime(context: Context) {
        disableRuntimeComponents(context)
        runCatching { context.stopService(Intent(context, BrickLocationService::class.java)) }
        runCatching { RecoveryScheduler.cancelAll(context) }
        runCatching { WorkManager.getInstance(context).cancelUniqueWork(EXPIRY_WORK) }
    }
}
