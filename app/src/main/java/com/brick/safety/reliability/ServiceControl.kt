package com.brick.safety.reliability

import android.content.Context
import android.content.Intent
import android.location.LocationManager
import androidx.core.content.ContextCompat
import com.brick.safety.location.BrickLocationService
import com.brick.safety.managed.ManagedPolicy
import com.brick.safety.privileged.PrivilegedBridgeRuntime

object ServiceControl {
    fun ensureTracking(context: Context) {
        runCatching { ManagedPolicy.apply(context) }
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        if (prefs.getString("deviceId", null).isNullOrBlank()) {
            runCatching { RecoveryScheduler.ensureScheduled(context) }
            return
        }

        // SOS is already durably queued before this path is called. A privileged Location attempt is
        // therefore an enhancement only: if unavailable/denied/timed-out the alert and Brick Core
        // continue normally using the existing evidence/fallback stack.
        if (prefs.getBoolean("sosActive", false)) {
            val locationOff = runCatching {
                !context.getSystemService(LocationManager::class.java).isLocationEnabled
            }.getOrDefault(false)
            if (locationOff) runCatching { PrivilegedBridgeRuntime.current().attemptSosLocationEnable() }
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
