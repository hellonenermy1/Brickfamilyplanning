package com.brick.safety.maintenance

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.location.LocationManager
import android.net.wifi.rtt.WifiRttManager
import android.os.Build
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import com.brick.safety.privileged.PrivilegedBridgeRuntime
import org.json.JSONArray
import org.json.JSONObject

/** Durable V1 capability truth. Unsupported is a capability state, never a device-health failure. */
object CapabilityProfileStore {
    private const val PREFS = "brick_capability_profile_v1"
    private const val KEY_JSON = "profile"
    private const val VERSION = 1

    fun refresh(context: Context): JSONObject {
        val app = context.applicationContext
        val pm = app.packageManager
        val sensors = app.getSystemService(SensorManager::class.java)
        val dpm = app.getSystemService(DevicePolicyManager::class.java)
        val location = app.getSystemService(LocationManager::class.java)
        val telephony = app.getSystemService(TelephonyManager::class.java)
        val privileged = runCatching { PrivilegedBridgeRuntime.current().health() }.getOrNull()
        fun granted(permission: String) = ContextCompat.checkSelfPermission(app, permission) == PackageManager.PERMISSION_GRANTED
        fun sensor(type: Int) = sensors.getDefaultSensor(type) != null
        val rtt = if (Build.VERSION.SDK_INT >= 28) runCatching { app.getSystemService(WifiRttManager::class.java)?.isAvailable == true }.getOrDefault(false) else false

        val profile = JSONObject()
            .put("version", VERSION)
            .put("updatedAtMs", System.currentTimeMillis())
            .put("androidSdk", Build.VERSION.SDK_INT)
            .put("deviceOwner", runCatching { dpm.isDeviceOwnerApp(app.packageName) }.getOrDefault(false))
            .put("locationApi", location != null)
            .put("fineLocationPermission", granted(Manifest.permission.ACCESS_FINE_LOCATION))
            .put("backgroundLocationPermission", Build.VERSION.SDK_INT < 29 || granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
            .put("activityRecognitionPermission", Build.VERSION.SDK_INT < 29 || granted(Manifest.permission.ACTIVITY_RECOGNITION))
            .put("wifi", pm.hasSystemFeature(PackageManager.FEATURE_WIFI))
            .put("wifiRtt", rtt)
            .put("bluetoothLe", pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE))
            .put("cellular", telephony != null && pm.hasSystemFeature(PackageManager.FEATURE_TELEPHONY))
            .put("accelerometer", sensor(Sensor.TYPE_ACCELEROMETER))
            .put("gyroscope", sensor(Sensor.TYPE_GYROSCOPE))
            .put("magnetometer", sensor(Sensor.TYPE_MAGNETIC_FIELD))
            .put("rotationVector", sensor(Sensor.TYPE_ROTATION_VECTOR))
            .put("stepCounter", sensor(Sensor.TYPE_STEP_COUNTER))
            .put("stepDetector", sensor(Sensor.TYPE_STEP_DETECTOR))
            .put("shizukuProvider", privileged?.provider ?: "none")
            .put("shizukuAvailable", privileged?.available ?: false)
            .put("shizukuPermissionGranted", privileged?.permissionGranted ?: false)
            .put("shizukuCapabilities", JSONArray((privileged?.capabilities ?: emptySet()).map { it.name.lowercase() }.sorted()))
            .put("wifiOneShotControl", if (runCatching { dpm.isDeviceOwnerApp(app.packageName) }.getOrDefault(false)) "supported_by_device_owner_api" else "permission_required")
            .put("mobileDataControl", "unsupported_unverified")
            .put("simControl", "unsupported_unverified")
            .put("futureAuthenticatedRangingInterface", "implemented_interface_no_required_hardware")

        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_JSON, profile.toString()).commit()
        return profile
    }

    fun current(context: Context): JSONObject {
        val raw = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_JSON, null)
        return runCatching { JSONObject(raw ?: "") }.getOrElse { refresh(context) }
    }
}
