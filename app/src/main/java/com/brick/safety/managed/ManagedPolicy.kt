package com.brick.safety.managed

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.UserManager

object ManagedPolicy {
    fun isDeviceOwner(context: Context): Boolean {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        return runCatching { dpm.isDeviceOwnerApp(context.packageName) }.getOrDefault(false)
    }

    /**
     * Applies each supported safety policy independently. A vendor-specific policy failure must
     * never prevent Brick's foreground tracking service from starting or recovering.
     * Returns true only when Brick is Device Owner; individual failures remain observable through
     * the actual permission/location health evidence rather than being mistaken for success.
     */
    @Suppress("DEPRECATION")
    fun apply(context: Context): Boolean {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        if (!runCatching { dpm.isDeviceOwnerApp(context.packageName) }.getOrDefault(false)) return false
        val admin = ComponentName(context, BrickDeviceAdminReceiver::class.java)

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

        // Brick signs replay-protected health/safety requests and timestamps location history. A
        // manually wrong wall clock can therefore make otherwise valid signed traffic look stale or
        // future-dated to the server. Device Owner mode can remove that avoidable failure mode by
        // requiring network-provided time. Each operation stays isolated so an OEM policy failure
        // cannot prevent the foreground tracker itself from running.
        if (Build.VERSION.SDK_INT >= 30) {
            runCatching { dpm.setAutoTimeEnabled(admin, true) }
            runCatching { dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME) }
        } else {
            runCatching { dpm.setAutoTimeRequired(admin, true) }
        }

        if (Build.VERSION.SDK_INT >= 30) {
            runCatching { dpm.setLocationEnabled(admin, true) }
            runCatching { dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION) }
        }
        return true
    }
}
