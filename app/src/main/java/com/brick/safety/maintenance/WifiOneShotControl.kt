package com.brick.safety.maintenance

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.net.wifi.WifiManager

object WifiOneShotControl {
    data class Result(val targetEnabled: Boolean, val actualEnabled: Boolean?, val success: Boolean, val detail: String)

    @Suppress("DEPRECATION")
    fun apply(context: Context, enabled: Boolean): Result {
        val app = context.applicationContext
        if (!enabled) {
            val p = app.getSharedPreferences("brick", Context.MODE_PRIVATE)
            if (p.getBoolean("sosActive", false) || p.getBoolean("fallHighActive", false)) {
                return Result(false, current(app), false, "deferred_safety")
            }
        }
        val dpm = app.getSystemService(DevicePolicyManager::class.java)
        val owner = runCatching { dpm.isDeviceOwnerApp(app.packageName) }.getOrDefault(false)
        if (!owner) return Result(enabled, current(app), false, "device_owner_required")
        val wifi = app.getSystemService(WifiManager::class.java)
        val before = runCatching { wifi.isWifiEnabled }.getOrNull()
        if (before == enabled) return Result(enabled, before, true, "already_current")
        val requested = runCatching { wifi.setWifiEnabled(enabled) }.getOrDefault(false)
        val actual = runCatching { wifi.isWifiEnabled }.getOrNull()
        return Result(enabled, actual, actual == enabled, if (actual == enabled) "device_owner_one_shot" else if (!requested) "platform_rejected_request" else "actual_state_not_confirmed")
    }

    @Suppress("DEPRECATION")
    private fun current(context: Context): Boolean? = runCatching { context.getSystemService(WifiManager::class.java).isWifiEnabled }.getOrNull()
}
