package com.brick.safety.managed

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.location.LocationManager
import android.os.Build
import android.os.UserManager
import com.brick.safety.beta.BetaSafety
import com.brick.safety.privileged.PrivilegedBridgeRuntime

/** Device Owner policy surface. Location commands are deliberately one-shot in Phase 8. */
object ManagedPolicy {
    private const val PREFS = "brick_managed_policy_p8"
    private const val KEY_MIGRATED = "migrated"
    private const val KEY_CONSUMED_COMMAND_ID = "consumed_location_command_id"
    private const val KEY_LAST_MATCHED = "last_location_command_matched"
    private const val KEY_LAST_ATTEMPT_AT = "last_location_command_attempt_at"

    fun isDeviceOwner(context: Context): Boolean {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        return runCatching { dpm.isDeviceOwnerApp(context.packageName) }.getOrDefault(false)
    }

    /**
     * Applies durable base Device Owner policy and, at most once per authenticated command id,
     * attempts the requested Android Location state. Brick never adds DISALLOW_CONFIG_LOCATION in
     * Phase 8 and never continuously reconciles Location after the one-shot attempt.
     */
    @Suppress("DEPRECATION")
    fun apply(context: Context): Boolean {
        val app = context.applicationContext
        val dpm = app.getSystemService(DevicePolicyManager::class.java)
        val owner = runCatching { dpm.isDeviceOwnerApp(app.packageName) }.getOrDefault(false)
        if (!BetaSafety.isOperational(app)) return owner

        val admin = ComponentName(app, BrickDeviceAdminReceiver::class.java)
        if (owner) {
            // Upgrade repair: Phase 7 could lock the Location settings UI. Phase 8 explicitly does not.
            runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION) }

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
                        app.packageName,
                        permission,
                        DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
                    )
                }
            }

            // Time integrity remains a base safety policy because signed/replay-protected traffic
            // depends on sane time. Each call is isolated from OEM-specific failures.
            if (Build.VERSION.SDK_INT >= 30) {
                runCatching { dpm.setAutoTimeEnabled(admin, true) }
                runCatching { dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME) }
            } else {
                runCatching { dpm.setAutoTimeRequired(admin, true) }
            }
        }

        applyLocationCommandOnce(app, dpm, admin, owner)
        return owner
    }

    private fun applyLocationCommandOnce(
        context: Context,
        dpm: DevicePolicyManager,
        admin: ComponentName,
        owner: Boolean
    ) {
        val state = ParentLocationStateStore.read(context)
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        if (!prefs.getBoolean(KEY_MIGRATED, false)) {
            // A Phase 7 command may already have been applied repeatedly. Mark that inherited command
            // consumed on upgrade rather than unexpectedly toggling Location one more time.
            val edit = prefs.edit().putBoolean(KEY_MIGRATED, true)
            state.commandId?.let { edit.putString(KEY_CONSUMED_COMMAND_ID, it) }
            edit.commit()
            return
        }

        val commandId = state.commandId ?: return
        if (prefs.getString(KEY_CONSUMED_COMMAND_ID, null) == commandId) return

        // Persist consumption BEFORE touching system state. If the process dies mid-attempt, the same
        // command is not replayed forever after reboot. A new authenticated command can still try again.
        val claimed = prefs.edit()
            .putString(KEY_CONSUMED_COMMAND_ID, commandId)
            .putLong(KEY_LAST_ATTEMPT_AT, System.currentTimeMillis())
            .remove(KEY_LAST_MATCHED)
            .commit()
        if (!claimed) return

        val desiredOn = state.desired == DesiredLocationState.ON
        val lm = context.getSystemService(LocationManager::class.java)
        var actual = runCatching { lm.isLocationEnabled }.getOrNull()

        if (actual != desiredOn && owner && Build.VERSION.SDK_INT >= 30) {
            runCatching { dpm.setLocationEnabled(admin, desiredOn) }
            actual = runCatching { lm.isLocationEnabled }.getOrNull()
        }

        if (actual != desiredOn) {
            runCatching {
                PrivilegedBridgeRuntime.current().setParentLocationState(desiredOn).getOrDefault(false)
            }
            actual = runCatching { lm.isLocationEnabled }.getOrNull()
        }

        prefs.edit().putBoolean(KEY_LAST_MATCHED, actual == desiredOn).apply()
    }

    fun lastConsumedLocationCommandId(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_CONSUMED_COMMAND_ID, null)

    fun lastLocationCommandMatched(context: Context): Boolean? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return if (prefs.contains(KEY_LAST_MATCHED)) prefs.getBoolean(KEY_LAST_MATCHED, false) else null
    }
}
