package com.brick.safety.reliability

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import org.json.JSONObject

object HealthEvidence {
    fun collect(context: Context): JSONObject {
        val sensorManager = context.getSystemService(SensorManager::class.java)
        val powerManager = context.getSystemService(PowerManager::class.java)
        val activityManager = context.getSystemService(ActivityManager::class.java)
        val connectivity = context.getSystemService(ConnectivityManager::class.java)
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val lastRecovery = prefs.getLong("lastSelfRecoveryWallMs", 0L)
        val lastJournalFailure = prefs.getLong("lastJournalWriteFailureWallMs", 0L)
        val lastSafetyOutboxFailure = prefs.getLong("lastSafetyOutboxWriteFailureWallMs", 0L)
        val bleAnchorConfigCount = prefs.getInt("bleAnchorConfigCount", 0).coerceIn(0, 8)

        fun ageSince(wallMs: Long): Any = if (wallMs > 0L) (now - wallMs).coerceAtLeast(0L) else JSONObject.NULL

        val nextHealthSequence = prefs.getLong("healthSequence", 0L) + 1L
        val healthCounterWriteHealthy = prefs.edit().putLong("healthSequence", nextHealthSequence).commit()
        val healthSequence = if (healthCounterWriteHealthy) nextHealthSequence else 0L

        val activeNetwork = connectivity.activeNetwork
        val caps = activeNetwork?.let { connectivity.getNetworkCapabilities(it) }
        val networkValidated = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true

        fun granted(permission: String): Boolean =
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

        return JSONObject()
            .put("healthSequence", healthSequence)
            .put("healthSentAtMs", now)
            .put("healthCounterWriteHealthy", healthCounterWriteHealthy)
            .put("fineLocationPermission", granted(Manifest.permission.ACCESS_FINE_LOCATION))
            .put("backgroundLocationPermission", granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
            .put("activityRecognitionPermission", granted(Manifest.permission.ACTIVITY_RECOGNITION))
            .put("bleAnchorConfigCount", bleAnchorConfigCount)
            .put("bluetoothScanPermission", Build.VERSION.SDK_INT < 31 || granted(Manifest.permission.BLUETOOTH_SCAN))
            .put("notificationPermission", Build.VERSION.SDK_INT < 33 || granted(Manifest.permission.POST_NOTIFICATIONS))
            .put("batteryOptimizationExempt", powerManager.isIgnoringBatteryOptimizations(context.packageName))
            .put("powerSaveMode", powerManager.isPowerSaveMode)
            .put("backgroundRestricted", activityManager.isBackgroundRestricted)
            .put("networkValidated", networkValidated)
            .put("dataSaverRestricted", connectivity.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED)
            .put("accelerometerAvailable", sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null)
            .put("gyroscopeAvailable", sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null)
            .put("rotationVectorAvailable", sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null)
            .put("stepCounterAvailable", sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null)
            .put("stepDetectorAvailable", sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) != null)
            .put("lastSelfRecoveryAgeMs", ageSince(lastRecovery))
            .put("journalWriteHealthy", prefs.getBoolean("journalWriteHealthy", true))
            .put("lastJournalWriteFailureAgeMs", ageSince(lastJournalFailure))
            .put("safetyOutboxWriteHealthy", prefs.getBoolean("safetyOutboxWriteHealthy", true))
            .put("lastSafetyOutboxWriteFailureAgeMs", ageSince(lastSafetyOutboxFailure))
    }
}
