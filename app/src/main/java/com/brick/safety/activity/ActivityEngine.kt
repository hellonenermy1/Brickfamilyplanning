package com.brick.safety.activity

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.DetectedActivity

class ActivityEngine(private val context: Context) {
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
        if (!hasPermission()) return
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
            // Permission may be revoked between our check and the Play Services call.
            ActivityState.write(context, ActivityMode.UNKNOWN, 0)
        }
    }

    @SuppressLint("MissingPermission")
    fun stop() {
        // Removal can also throw if permission was revoked while Brick was running.
        try { client.removeActivityUpdates(sampleIntent) } catch (_: SecurityException) {}
        try { client.removeActivityTransitionUpdates(transitionIntent) } catch (_: SecurityException) {}
    }

    fun snapshot(): ActivitySnapshot = ActivityState.read(context)

    private fun hasPermission(): Boolean = ContextCompat.checkSelfPermission(
        context, Manifest.permission.ACTIVITY_RECOGNITION
    ) == PackageManager.PERMISSION_GRANTED

    private fun pendingFlags(): Int = PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
}
