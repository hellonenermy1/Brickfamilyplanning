package com.brick.safety.reliability

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.brick.safety.location.BrickLocationService
import com.brick.safety.managed.ManagedPolicy

object ServiceControl {
    fun ensureTracking(context: Context) {
        ManagedPolicy.apply(context)
        RecoveryScheduler.ensureScheduled(context)
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        if (prefs.getString("deviceId", null).isNullOrBlank()) return
        ContextCompat.startForegroundService(
            context,
            Intent(context, BrickLocationService::class.java).setAction(BrickLocationService.ACTION_ENSURE_RUNNING)
        )
    }
}
