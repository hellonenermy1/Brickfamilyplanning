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
    fun apply(context: Context): Boolean {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        if (!runCatching { dpm.isDeviceOwnerApp(context.packageName) }.getOrDefault(false)) return false
        val admin = ComponentName(context, BrickDeviceAdminReceiver::class.java)

        listOf(
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_BACKGROUND_LOCATION,
            Manifest.permission.ACTIVITY_RECOGNITION
        ).forEach { permission ->
            runCatching {
                dpm.setPermissionGrantState(
                    admin,
                    context.packageName,
                    permission,
                    DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
                )
            }
        }
        if (Build.VERSION.SDK_INT >= 33) {
            runCatching {
                dpm.setPermissionGrantState(
                    admin,
                    context.packageName,
                    Manifest.permission.POST_NOTIFICATIONS,
                    DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
                )
            }
        }

        if (Build.VERSION.SDK_INT >= 30) {
            runCatching { dpm.setLocationEnabled(admin, true) }
            runCatching { dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION) }
        }
        return true
    }
}
