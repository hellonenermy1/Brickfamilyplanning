package com.brick.safety.reliability

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.brick.safety.location.BrickLocationService
import com.brick.safety.managed.ManagedPolicy

object ServiceControl {
    fun ensureTracking(context: Context) {
        runCatching { ManagedPolicy.apply(context) }
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        if (prefs.getString("deviceId", null).isNullOrBlank()) {
            runCatching { RecoveryScheduler.ensureScheduled(context) }
            return
        }

        // Live tracking is primary. WorkManager is only a recovery backstop and must never be able
        // to prevent a foreground-service start if its own scheduler/database is unhealthy.
        ContextCompat.startForegroundService(
            context,
            Intent(context, BrickLocationService::class.java).setAction(BrickLocationService.ACTION_ENSURE_RUNNING)
        )
        runCatching { RecoveryScheduler.ensureScheduled(context) }
    }
}
