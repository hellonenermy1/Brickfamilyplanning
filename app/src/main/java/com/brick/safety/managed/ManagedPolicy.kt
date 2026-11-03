package com.brick.safety.managed

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.location.LocationManager
import android.os.Build
import android.os.UserManager
import android.provider.Settings
import com.brick.safety.beta.BetaSafety
import com.brick.safety.maintenance.PolicyLedger
import com.brick.safety.privileged.PrivilegedBridgeRuntime

/** Device Owner policy surface. Parent Location commands are one-shot actions, never persistent policy. */
object ManagedPolicy {
    fun isDeviceOwner(context: Context): Boolean {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        return runCatching { dpm.isDeviceOwnerApp(context.packageName) }.getOrDefault(false)
    }

    @Suppress("DEPRECATION")
    fun apply(context: Context): Boolean {
        val app = context.applicationContext
        val dpm = app.getSystemService(DevicePolicyManager::class.java)
        val owner = runCatching { dpm.isDeviceOwnerApp(app.packageName) }.getOrDefault(false)
        if (!BetaSafety.isOperational(app)) return owner

        ParentLocationStateStore.migrateLegacyToHistory(app)
        val admin = ComponentName(app, BrickDeviceAdminReceiver::class.java)
        if (owner && PolicyLedger.ensureReadyForPolicyMutation(app)) {
            applyBasePolicy(app, dpm, admin)
        }
        // Parent Location is a one-shot action rather than a retained policy. A broken provenance
        // ledger blocks new Brick policy mutation, but does not turn the optional one-shot command
        // into a permanent policy or silently repair the ledger.
        applyPendingLocationCommand(app, dpm, admin, owner)
        return owner
    }

    @Suppress("DEPRECATION")
    private fun applyBasePolicy(context: Context, dpm: DevicePolicyManager, admin: ComponentName) {
        // Upgrade repair only. The V1 one-shot Location feature never creates this restriction.
        runCatching {
            if (dpm.getUserRestrictions(admin).getBoolean(UserManager.DISALLOW_CONFIG_LOCATION, false)) {
                dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION)
            }
        }

        val permissions = mutableListOf(
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_BACKGROUND_LOCATION,
            Manifest.permission.ACTIVITY_RECOGNITION
        )
        if (Build.VERSION.SDK_INT >= 31) {
            permissions += Manifest.permission.BLUETOOTH_SCAN
            permissions += Manifest.permission.BLUETOOTH_ADVERTISE
        }
        if (Build.VERSION.SDK_INT >= 33) {
            permissions += Manifest.permission.NEARBY_WIFI_DEVICES
            permissions += Manifest.permission.POST_NOTIFICATIONS
        }

        permissions.forEach { permission ->
            runCatching {
                val current = dpm.getPermissionGrantState(admin, context.packageName, permission)
                if (current != DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED) {
                    val ledgerId = PolicyLedger.record(
                        context,
                        "permission:$permission",
                        current.toString(),
                        DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED.toString(),
                        "base_device_owner_policy"
                    )
                    // Never perform a Brick policy mutation without durable provenance.
                    if (ledgerId != null) {
                        dpm.setPermissionGrantState(
                            admin,
                            context.packageName,
                            permission,
                            DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
                        )
                    }
                }
            }
        }

        if (Build.VERSION.SDK_INT >= 30) {
            runCatching {
                val autoTimeBefore = Settings.Global.getInt(context.contentResolver, Settings.Global.AUTO_TIME, 1) != 0
                if (!autoTimeBefore) {
                    val ledgerId = PolicyLedger.record(context, "auto_time", "false", "true", "base_time_integrity")
                    if (ledgerId != null) dpm.setAutoTimeEnabled(admin, true)
                }
            }
            runCatching {
                val restrictions = dpm.getUserRestrictions(admin)
                if (!restrictions.getBoolean(UserManager.DISALLOW_CONFIG_DATE_TIME, false)) {
                    val ledgerId = PolicyLedger.record(
                        context,
                        "restriction:${UserManager.DISALLOW_CONFIG_DATE_TIME}",
                        "false",
                        "true",
                        "base_time_integrity"
                    )
                    if (ledgerId != null) dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME)
                }
            }
        } else {
            runCatching {
                val requiredBefore = dpm.getAutoTimeRequired()
                if (!requiredBefore) {
                    val ledgerId = PolicyLedger.record(
                        context,
                        "auto_time_required",
                        "false",
                        "true",
                        "base_time_integrity_api29"
                    )
                    if (ledgerId != null) dpm.setAutoTimeRequired(admin, true)
                }
            }
        }
    }

    private fun applyPendingLocationCommand(
        context: Context,
        dpm: DevicePolicyManager,
        admin: ComponentName,
        owner: Boolean
    ) {
        val state = ParentLocationStateStore.read(context)
        val commandId = state.commandId ?: return
        val target = state.target ?: return
        if (!state.actionable || !ParentLocationStateStore.claimPending(context, commandId)) return

        val desiredOn = target == DesiredLocationState.ON
        val lm = context.getSystemService(LocationManager::class.java)
        var actual = runCatching { lm.isLocationEnabled }.getOrNull()
        var method = "already_current"

        if (actual != desiredOn && owner && Build.VERSION.SDK_INT >= 30) {
            val attempted = runCatching {
                dpm.setLocationEnabled(admin, desiredOn)
                true
            }.getOrDefault(false)
            if (attempted) method = "device_owner"
            actual = runCatching { lm.isLocationEnabled }.getOrNull()
        }

        if (actual != desiredOn) {
            val attempted = runCatching {
                PrivilegedBridgeRuntime.current().setParentLocationState(desiredOn).getOrDefault(false)
            }.getOrDefault(false)
            if (attempted) method = "privileged_bridge"
            actual = runCatching { lm.isLocationEnabled }.getOrNull()
        }

        val matched = actual == desiredOn
        ParentLocationStateStore.complete(
            context,
            commandId,
            actualAfter = actual,
            matched = matched,
            detail = if (matched) method else "platform_did_not_confirm_target"
        )
    }

    fun lastLocationCommand(context: Context): ParentLocationState = ParentLocationStateStore.read(context)
}
