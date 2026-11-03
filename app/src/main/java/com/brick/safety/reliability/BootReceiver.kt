package com.brick.safety.reliability

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.brick.safety.atlas.CompanionPresenceStore
import com.brick.safety.beta.BetaSafety
import com.brick.safety.diagnostics.DiagnosticStore
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.maintenance.WifiScheduleManager

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val supported = intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_MY_PACKAGE_REPLACED ||
            intent.action == Intent.ACTION_TIMEZONE_CHANGED ||
            intent.action == Intent.ACTION_TIME_CHANGED
        if (!supported) return

        val app = context.applicationContext
        if (DeepOffManager.isActive(app)) {
            DeepOffManager.quiesce(app)
            DiagnosticStore.log(app, DiagnosticStore.Severity.INFO, "boot", "deep_off_remains_quiesced", "action=${intent.action}")
            return
        }
        if (!BetaSafety.enforceStartup(app)) {
            RecoveryScheduler.cancelAll(app)
            DiagnosticStore.log(app, DiagnosticStore.Severity.WARN, "boot", "runtime_blocked_retired_or_expired")
            return
        }

        DiagnosticStore.log(app, DiagnosticStore.Severity.INFO, "boot", "system_event", "action=${intent.action}")
        runCatching { CompanionPresenceStore.clearPresence(app) }
            .onFailure { DiagnosticStore.log(app, DiagnosticStore.Severity.WARN, "boot", "companion_presence_clear_failed", it.javaClass.simpleName, it) }
        runCatching { WifiScheduleManager.reschedule(app) }
            .onFailure { DiagnosticStore.log(app, DiagnosticStore.Severity.WARN, "wifi_schedule", "reschedule_failed", it.javaClass.simpleName, it) }

        val started = runCatching { ServiceControl.ensureTracking(app) }
            .onFailure { DiagnosticStore.log(app, DiagnosticStore.Severity.ERROR, "boot", "tracking_restart_failed", it.javaClass.simpleName, it) }
            .isSuccess
        if (!started) {
            runCatching { RecoveryScheduler.scheduleSoon(app, 20) }
                .onSuccess { DiagnosticStore.log(app, DiagnosticStore.Severity.WARN, "boot", "recovery_scheduled", "delaySeconds=20") }
                .onFailure { DiagnosticStore.log(app, DiagnosticStore.Severity.ERROR, "boot", "recovery_schedule_failed", it.javaClass.simpleName, it) }
        } else {
            runCatching { RecoveryScheduler.ensureScheduled(app) }
            DiagnosticStore.log(app, DiagnosticStore.Severity.INFO, "boot", "tracking_restart_requested")
        }
    }
}
