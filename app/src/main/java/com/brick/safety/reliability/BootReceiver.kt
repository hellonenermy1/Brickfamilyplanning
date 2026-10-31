package com.brick.safety.reliability

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            val app = context.applicationContext
            val started = runCatching { ServiceControl.ensureTracking(app) }.isSuccess
            if (!started) runCatching { RecoveryScheduler.scheduleSoon(app, 20) }
            else runCatching { RecoveryScheduler.ensureScheduled(app) }
        }
    }
}
