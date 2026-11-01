package com.brick.safety.managed

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.location.LocationManager
import android.os.Build
import android.os.UserManager
import com.brick.safety.privileged.PrivilegedBridgeRuntime

object ManagedPolicy {
    fun isDeviceOwner(context: Context): Boolean {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        return runCatching { dpm.isDeviceOwnerApp(context.packageName) }.getOrDefault(false)
    }

    /**
     * Device Owner is always the first control path. If the OEM accepts the call but the actual
     * Android Location state still does not match the authenticated parent request, Phase 6 may use
     * the optional typed privileged bridge as a fallback. Failure of either path never prevents
     * Brick's foreground tracker from starting/recovering.
     *
     * The return value intentionally preserves the pre-Phase-6 meaning: true only when Brick is
     * Device Owner. Actual desired-vs-observed Location state is reported separately in health.
     */
    @Suppress("DEPRECATION")
    fun apply(context: Context): Boolean {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val owner = runCatching { dpm.isDeviceOwnerApp(context.packageName) }.getOrDefault(false)
        val admin = ComponentName(context, BrickDeviceAdminReceiver::class.java)

        if (owner) {
            val permissions = mutableListOf(
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION,
                Manifest.permission.ACTIVITY_RECOGNITION
            )
            if (Build.VERSION.SDK_INT >= 31) permissions += Manifest.permission.BLUETOOTH_SCAN
            if (Build.VERSION.SDK_INT >= 33) {
                permissions += Manifest.permission.NEARBY_WIFI_DEVICES
                permissions += Manifest.permission.POST_NOTIFICATIONS
            }

            permissions.forEach { permission ->
                runCatching {
                    dpm.setPermissionGrantState(
                        admin,
                        context.packageName,
                        permission,
                        DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
                    )
                }
            }

            // Wrong wall time can make signed/replay-protected traffic look stale or future-dated.
            // Each policy remains isolated so an OEM-specific failure cannot stop Brick Core.
            if (Build.VERSION.SDK_INT >= 30) {
                runCatching { dpm.setAutoTimeEnabled(admin, true) }
                runCatching { dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME) }
            } else {
                runCatching { dpm.setAutoTimeRequired(admin, true) }
            }
        }

        val desiredOn = ParentLocationStateStore.read(context).desired == DesiredLocationState.ON
        if (owner && Build.VERSION.SDK_INT >= 30) {
            runCatching { dpm.setLocationEnabled(admin, desiredOn) }
            runCatching { dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION) }
        }

        // Never assume a policy call worked: verify the real system state and use Shizuku only as
        // a bounded fallback when it still mismatches. The bridge itself verifies state after write.
        val locationManager = context.getSystemService(LocationManager::class.java)
        val actualOn = runCatching { locationManager.isLocationEnabled }.getOrNull()
        if (actualOn != null && actualOn != desiredOn) {
            runCatching { PrivilegedBridgeRuntime.current().setParentLocationState(desiredOn) }
        }
        return owner
    }
}
