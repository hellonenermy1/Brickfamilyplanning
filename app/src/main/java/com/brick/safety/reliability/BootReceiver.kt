package com.brick.safety.reliability

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.brick.safety.atlas.CompanionPresenceStore
import com.brick.safety.diagnostics.DiagnosticStore

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val app = context.applicationContext
            DiagnosticStore.log(app, DiagnosticStore.Severity.INFO, "boot", "system_event", "action=${intent.action}")
            // Companion associations remain managed by Android, but an old in-range bit is not valid
            // after reboot/update until the system reports presence again.
            runCatching { CompanionPresenceStore.clearPresence(app) }
                .onFailure { DiagnosticStore.log(app, DiagnosticStore.Severity.WARN, "boot", "companion_presence_clear_failed", it.javaClass.simpleName, it) }
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
}
