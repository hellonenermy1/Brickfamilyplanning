package com.brick.safety.reliability

import android.content.Context
import android.content.Intent
import android.location.LocationManager
import androidx.core.content.ContextCompat
import com.brick.safety.beta.BetaSafety
import com.brick.safety.diagnostics.DiagnosticStore
import com.brick.safety.location.BrickLocationService
import com.brick.safety.managed.ManagedPolicy
import com.brick.safety.privileged.PrivilegedBridgeRuntime

object ServiceControl {
    fun ensureTracking(context: Context) {
        if (!BetaSafety.enforceStartup(context)) {
            DiagnosticStore.log(context, DiagnosticStore.Severity.WARN, "beta", "tracking_blocked_retired_or_expired")
            return
        }

        runCatching { ManagedPolicy.apply(context) }
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        if (prefs.getString("deviceId", null).isNullOrBlank()) {
            runCatching { RecoveryScheduler.ensureScheduled(context) }
            DiagnosticStore.log(context, DiagnosticStore.Severity.INFO, "service", "start_skipped_unpaired")
            return
        }

        if (prefs.getBoolean("sosActive", false)) {
            val locationOff = runCatching {
                !context.getSystemService(LocationManager::class.java).isLocationEnabled
            }.getOrDefault(false)
            if (locationOff) {
                runCatching { PrivilegedBridgeRuntime.current().attemptSosLocationEnable() }
                    .onSuccess { DiagnosticStore.log(context, DiagnosticStore.Severity.WARN, "service", "sos_privileged_location_attempt", "requested=$it") }
                    .onFailure { DiagnosticStore.log(context, DiagnosticStore.Severity.WARN, "service", "sos_privileged_location_failed", it.javaClass.simpleName, it) }
            }
        }

        try {
            ContextCompat.startForegroundService(
                context,
                Intent(context, BrickLocationService::class.java).setAction(BrickLocationService.ACTION_ENSURE_RUNNING)
            )
            DiagnosticStore.log(context, DiagnosticStore.Severity.INFO, "service", "foreground_start_requested")
        } catch (t: Throwable) {
            DiagnosticStore.log(context, DiagnosticStore.Severity.ERROR, "service", "foreground_start_failed", t.javaClass.simpleName, t)
            throw t
        }
        runCatching { RecoveryScheduler.ensureScheduled(context) }
            .onFailure { DiagnosticStore.log(context, DiagnosticStore.Severity.WARN, "recovery", "scheduler_setup_failed", it.javaClass.simpleName, it) }
    }
}
