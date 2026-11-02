package com.brick.safety.beta

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
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

object BetaSafety {
    private const val PREFS = "brick_beta_safety"
    private const val KEY_RETIRED = "retired"
    private const val KEY_RETIRE_REASON = "retire_reason"
    private const val KEY_RETIRED_AT = "retired_at"
    private const val EXPIRY_WORK = "brick-beta-expiry"

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

    fun isRetired(context: Context): Boolean {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_RETIRED, false)
    }

    fun isOperational(context: Context, nowMs: Long = System.currentTimeMillis()): Boolean {
        if (!BuildConfig.BRICK_BETA) return true
        return !isRetired(context) && !isExpired(nowMs)
    }

    fun enforceStartup(context: Context): Boolean {
        if (!BuildConfig.BRICK_BETA) return true

        if (isRetired(context)) {
            selfDestruct(context, "retired_retry", launchUninstall = false)
            return false
        }

        if (isExpired()) {
            selfDestruct(context, "automatic_expiry", launchUninstall = false)
            return false
        }

        scheduleExpiry(context)
        return true
    }

    fun scheduleExpiry(context: Context) {
        if (!BuildConfig.BRICK_BETA || isRetired(context)) return

        val delayMs = (expiryEpochMs() - System.currentTimeMillis()).coerceAtLeast(1_000L)
        val request = OneTimeWorkRequestBuilder<BetaExpiryWorker>()
            .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
            .build()

        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
            EXPIRY_WORK,
            ExistingWorkPolicy.REPLACE,
            request
        )
    }

    @Suppress("DEPRECATION")
    fun releaseDeviceOwner(context: Context): ReleaseResult {
        val appContext = context.applicationContext
        val dpm = appContext.getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(appContext, BrickDeviceAdminReceiver::class.java)

        val ownerBefore = runCatching { dpm.isDeviceOwnerApp(appContext.packageName) }
            .getOrDefault(false)

        var failure: Throwable? = null

        if (ownerBefore) {
            runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION) }
            runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME) }

            runCatching { dpm.clearDeviceOwnerApp(appContext.packageName) }
                .onFailure { failure = it }
        } else {
            val active = runCatching { dpm.isAdminActive(admin) }.getOrDefault(false)
            if (active) {
                runCatching { dpm.removeActiveAdmin(admin) }
                    .onFailure { failure = it }
            }
        }

        val ownerAfter = runCatching { dpm.isDeviceOwnerApp(appContext.packageName) }
            .getOrDefault(ownerBefore)
        val activeAdminAfter = runCatching { dpm.isAdminActive(admin) }
            .getOrDefault(ownerAfter)

        return ReleaseResult(
            ownerBefore = ownerBefore,
            ownerAfter = ownerAfter,
            activeAdminAfter = activeAdminAfter,
            error = failure?.javaClass?.simpleName
        )
    }

    fun selfDestruct(
        context: Context,
        reason: String,
        launchUninstall: Boolean
    ): ReleaseResult {
        val appContext = context.applicationContext
        appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_RETIRED, true)
            .putString(KEY_RETIRE_REASON, reason.take(80))
            .putLong(KEY_RETIRED_AT, System.currentTimeMillis())
            .commit()

        shutdownRuntime(appContext)
        val release = releaseDeviceOwner(appContext)

        if (launchUninstall) {
            openUninstallScreen(appContext)
        }

        return release
    }

    fun openUninstallScreen(context: Context) {
        val appContext = context.applicationContext
        val intent = Intent(
            Intent.ACTION_DELETE,
            Uri.parse("package:${appContext.packageName}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { appContext.startActivity(intent) }
    }

    private fun shutdownRuntime(context: Context) {
        runCatching {
            context.stopService(Intent(context, BrickLocationService::class.java))
        }
        runCatching { RecoveryScheduler.cancelAll(context) }
        runCatching {
            WorkManager.getInstance(context).cancelUniqueWork(EXPIRY_WORK)
        }
    }
}
