package com.brick.safety.reliability

import android.content.Context
import android.content.Intent
import android.location.LocationManager
import androidx.core.content.ContextCompat
import com.brick.safety.beta.BetaSafety
import com.brick.safety.diagnostics.DiagnosticStore
import com.brick.safety.location.BrickLocationService
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.maintenance.DeviceRoleStore
import com.brick.safety.managed.ManagedPolicy
import com.brick.safety.privileged.PrivilegedBridgeRuntime

object ServiceControl {
    fun ensureTracking(context: Context) {
        val app = context.applicationContext
        if (DeviceRoleStore.role(app) != DeviceRoleStore.Role.CHILD) {
            RecoveryScheduler.cancelAll(app)
            runCatching { app.stopService(Intent(app, BrickLocationService::class.java)) }
            DiagnosticStore.log(app, DiagnosticStore.Severity.INFO, "service", "tracking_blocked_non_child_role")
            return
        }
        if (DeepOffManager.isActive(app)) {
            DeepOffManager.quiesce(app)
            DiagnosticStore.log(app, DiagnosticStore.Severity.INFO, "service", "tracking_blocked_deep_off")
            return
        }
        if (!BetaSafety.enforceStartup(app)) {
            DiagnosticStore.log(app, DiagnosticStore.Severity.WARN, "beta", "tracking_blocked_retired_or_expired")
            return
        }

        runCatching { ManagedPolicy.apply(app) }
        val prefs = app.getSharedPreferences("brick", Context.MODE_PRIVATE)
        if (prefs.getString("deviceId", null).isNullOrBlank()) {
            runCatching { RecoveryScheduler.ensureScheduled(app) }
            DiagnosticStore.log(app, DiagnosticStore.Severity.INFO, "service", "start_skipped_unpaired")
            return
        }

        if (prefs.getBoolean("sosActive", false)) {
            val locationOff = runCatching { !app.getSystemService(LocationManager::class.java).isLocationEnabled }.getOrDefault(false)
            if (locationOff) {
                runCatching { PrivilegedBridgeRuntime.current().attemptSosLocationEnable() }
                    .onSuccess { DiagnosticStore.log(app, DiagnosticStore.Severity.WARN, "service", "sos_privileged_location_attempt", "requested=$it") }
                    .onFailure { DiagnosticStore.log(app, DiagnosticStore.Severity.WARN, "service", "sos_privileged_location_failed", it.javaClass.simpleName, it) }
            }
        }

        try {
            ContextCompat.startForegroundService(
                app,
                Intent(app, BrickLocationService::class.java).setAction(BrickLocationService.ACTION_ENSURE_RUNNING)
            )
            DiagnosticStore.log(app, DiagnosticStore.Severity.INFO, "service", "foreground_start_requested")
        } catch (t: Throwable) {
            DiagnosticStore.log(app, DiagnosticStore.Severity.ERROR, "service", "foreground_start_failed", t.javaClass.simpleName, t)
            throw t
        }
        runCatching { RecoveryScheduler.ensureScheduled(app) }
            .onFailure { DiagnosticStore.log(app, DiagnosticStore.Severity.WARN, "recovery", "scheduler_setup_failed", it.javaClass.simpleName, it) }
    }
}
