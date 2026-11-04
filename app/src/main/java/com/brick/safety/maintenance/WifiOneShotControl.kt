package com.brick.safety.maintenance

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.net.wifi.WifiManager

object WifiOneShotControl {
    data class Result(val targetEnabled: Boolean, val actualEnabled: Boolean?, val success: Boolean, val detail: String)

    @Suppress("DEPRECATION")
    fun apply(context: Context, enabled: Boolean): Result {
        val app = context.applicationContext
        // An already-authorised deprovision or Deep Off must block even delayed maintenance
        // executor requests; avoid changing the user's radio after quiescence has begun.
        if (DeprovisionManager.stage(app) != DeprovisionManager.Stage.NONE ||
            DeepOffManager.isActive(app)) {
            return Result(enabled, current(app), false, "deprovision_or_deep_off_quiesced")
        }
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
        // Wi-Fi hardware state changes asynchronously. A request being accepted is not completion,
        // and an immediate read can falsely report failure on a healthy slow adapter. Wait for
        // the *observed* target and never turn an explicitly rejected request into "completed".
        val actual = if (requested) WifiScheduleManager.awaitWifiState(wifi, enabled)
            else runCatching { wifi.isWifiEnabled }.getOrNull()
        val confirmed = requested && actual == enabled
        return Result(
            enabled,
            actual,
            confirmed,
            when {
                confirmed -> "device_owner_one_shot_confirmed"
                !requested -> "platform_rejected_request"
                else -> "actual_state_confirmation_timeout"
            }
        )
    }

    @Suppress("DEPRECATION")
    private fun current(context: Context): Boolean? = runCatching { context.getSystemService(WifiManager::class.java).isWifiEnabled }.getOrNull()
}
