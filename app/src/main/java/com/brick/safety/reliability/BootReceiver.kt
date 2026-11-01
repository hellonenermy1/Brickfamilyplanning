package com.brick.safety.reliability

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.brick.safety.atlas.CompanionPresenceStore

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val app = context.applicationContext
            // Companion associations remain managed by Android, but an old in-range bit is not valid
            // after reboot/update until the system reports presence again.
            runCatching { CompanionPresenceStore.clearPresence(app) }
            val started = runCatching { ServiceControl.ensureTracking(app) }.isSuccess
            if (!started) runCatching { RecoveryScheduler.scheduleSoon(app, 20) }
            else runCatching { RecoveryScheduler.ensureScheduled(app) }
        }
    }
}
