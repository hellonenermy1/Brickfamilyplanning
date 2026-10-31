package com.brick.safety.activity

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity

class ActivityEngine(private val context: Context) {
    companion object { private const val ACTIVITY_STALE_MS = 2 * 60_000L }

    private val client = ActivityRecognition.getClient(context)

    private val sampleIntent: PendingIntent by lazy {
        PendingIntent.getBroadcast(
            context, 4101,
            Intent(context, ActivityReceiver::class.java).setAction("com.brick.safety.ACTIVITY_SAMPLE"),
            pendingFlags()
        )
    }

    private val transitionIntent: PendingIntent by lazy {
        PendingIntent.getBroadcast(
            context, 4102,
            Intent(context, ActivityReceiver::class.java).setAction("com.brick.safety.ACTIVITY_TRANSITION"),
            pendingFlags()
        )
    }

    @SuppressLint("MissingPermission")
    fun start() {
        if (!hasPermission()) {
            ActivityState.write(context, ActivityMode.UNKNOWN, 0)
            return
        }
        val types = intArrayOf(
            DetectedActivity.STILL,
            DetectedActivity.WALKING,
            DetectedActivity.RUNNING,
            DetectedActivity.ON_BICYCLE,
            DetectedActivity.IN_VEHICLE
        )
        val transitions = buildList {
            for (type in types) {
                add(ActivityTransition.Builder().setActivityType(type)
                    .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER).build())
                add(ActivityTransition.Builder().setActivityType(type)
                    .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT).build())
            }
        }

        try {
            client.requestActivityTransitionUpdates(ActivityTransitionRequest(transitions), transitionIntent)
            client.requestActivityUpdates(10_000L, sampleIntent)
        } catch (_: SecurityException) {
            ActivityState.write(context, ActivityMode.UNKNOWN, 0)
        }
    }

    @SuppressLint("MissingPermission")
    fun stop() {
        try { client.removeActivityUpdates(sampleIntent) } catch (_: SecurityException) {}
        try { client.removeActivityTransitionUpdates(transitionIntent) } catch (_: SecurityException) {}
    }

    fun snapshot(): ActivitySnapshot {
        if (!hasPermission()) return ActivitySnapshot(ActivityMode.UNKNOWN, 0, 0L)
        val current = ActivityState.read(context)
        val now = SystemClock.elapsedRealtime()
        if (current.updatedElapsedMs <= 0L || current.updatedElapsedMs > now || now - current.updatedElapsedMs > ACTIVITY_STALE_MS) {
            return ActivitySnapshot(ActivityMode.UNKNOWN, 0, current.updatedElapsedMs)
        }
        return current
    }

    private fun hasPermission(): Boolean = ContextCompat.checkSelfPermission(
        context, Manifest.permission.ACTIVITY_RECOGNITION
    ) == PackageManager.PERMISSION_GRANTED

    private fun pendingFlags(): Int = PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
}
