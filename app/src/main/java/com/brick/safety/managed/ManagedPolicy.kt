package com.brick.safety.managed

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.UserManager

object ManagedPolicy {
    fun isDeviceOwner(context: Context): Boolean {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        return dpm.isDeviceOwnerApp(context.packageName)
    }

    fun apply(context: Context): Boolean {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        if (!dpm.isDeviceOwnerApp(context.packageName)) return false
        val admin = ComponentName(context, BrickDeviceAdminReceiver::class.java)

        // Brick intentionally manages only the safety-critical location switch.
        dpm.setLocationEnabled(admin, true)
        dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION)
        return true
    }
}
