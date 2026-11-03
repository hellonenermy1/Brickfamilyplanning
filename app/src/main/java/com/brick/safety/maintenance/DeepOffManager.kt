package com.brick.safety.maintenance

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import com.brick.safety.diagnostics.DiagnosticMonitor
import com.brick.safety.location.BrickLocationService
import com.brick.safety.reliability.FallDetectorRuntime
import com.brick.safety.reliability.RecoveryScheduler
import com.brick.safety.reliability.ServiceControl
import org.json.JSONObject

/** Reversible production Deep Off with durable exact-state provenance. */
object DeepOffManager {
    private const val PREFS = "brick_deep_off_v1"
    private const val KEY_ACTIVE = "active"
    private const val KEY_ENTERED_AT = "enteredAtMs"
    private const val KEY_SNAPSHOT = "snapshot"
    private const val KEY_REACTIVATED_AT = "reactivatedAtMs"
    private const val VERSION = 2
    private const val BRICK_DEEP_OFF_COMPONENT_STATE = PackageManager.COMPONENT_ENABLED_STATE_DISABLED

    data class Snapshot(
        val active: Boolean,
        val enteredAtMs: Long,
        val paired: Boolean,
        val serviceComponentState: Int,
        val policyLedgerActiveCount: Int
    )

    /**
     * PURGE_BRICK is stronger than Deep Off. Treat it as permanently quiesced without consulting or
     * recreating the purged Deep Off preference file.
     */
    fun isActive(context: Context): Boolean {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return true
        return app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ACTIVE, false)
    }

    fun snapshot(context: Context): Snapshot {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) {
            return Snapshot(
                active = true,
                enteredAtMs = 0L,
                paired = false,
                serviceComponentState = app.packageManager.getComponentEnabledSetting(ComponentName(app, BrickLocationService::class.java)),
                policyLedgerActiveCount = 0
            )
        }
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val component = ComponentName(app, BrickLocationService::class.java)
        return Snapshot(
            active = prefs.getBoolean(KEY_ACTIVE, false),
            enteredAtMs = prefs.getLong(KEY_ENTERED_AT, 0L).coerceAtLeast(0L),
            paired = app.getSharedPreferences("brick", Context.MODE_PRIVATE).contains("deviceId"),
            serviceComponentState = app.packageManager.getComponentEnabledSetting(component),
            policyLedgerActiveCount = PolicyLedger.active(app).size
        )
    }

    @Synchronized
    fun enter(context: Context): Boolean {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return false
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_ACTIVE, false)) {
            quiesce(app)
            return true
        }

        val component = ComponentName(app, BrickLocationService::class.java)
        val stateBefore = app.packageManager.getComponentEnabledSetting(component)
        val snapshot = JSONObject()
            .put("version", VERSION)
            .put("serviceComponentStateBefore", stateBefore)
            .put("serviceComponentStateAppliedByBrick", BRICK_DEEP_OFF_COMPONENT_STATE)
            // Keep the v1 key readable for recovery from an interrupted older test build.
            .put("serviceComponentState", stateBefore)
            .put("paired", app.getSharedPreferences("brick", Context.MODE_PRIVATE).contains("deviceId"))
            .put("policyLedgerActiveCount", PolicyLedger.active(app).size)
            .put("capturedAtMs", System.currentTimeMillis())

        val committed = prefs.edit()
            .putBoolean(KEY_ACTIVE, true)
            .putLong(KEY_ENTERED_AT, System.currentTimeMillis())
            .putString(KEY_SNAPSHOT, snapshot.toString())
            .remove(KEY_REACTIVATED_AT)
            .commit()
        if (!committed) return false

        quiesce(app)
        return true
    }

    @Synchronized
    fun reactivate(context: Context): Boolean {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return false
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ACTIVE, false)) return true

        val raw = prefs.getString(KEY_SNAPSHOT, null)
        val snapshot = runCatching { JSONObject(raw ?: "{}") }.getOrElse { return false }
        val originalComponentState = if (snapshot.has("serviceComponentStateBefore")) {
            snapshot.optInt("serviceComponentStateBefore", PackageManager.COMPONENT_ENABLED_STATE_DEFAULT)
        } else {
            snapshot.optInt("serviceComponentState", PackageManager.COMPONENT_ENABLED_STATE_DEFAULT)
        }
        val appliedByBrick = snapshot.optInt("serviceComponentStateAppliedByBrick", BRICK_DEEP_OFF_COMPONENT_STATE)
        if (!validComponentState(originalComponentState) || !validComponentState(appliedByBrick)) return false

        val component = ComponentName(app, BrickLocationService::class.java)
        val currentState = app.packageManager.getComponentEnabledSetting(component)

        // Provenance rule: Brick restores only the temporary value Brick itself left behind. If the
        // component changed after Deep Off (user/system/admin/newer code), that later state wins.
        if (currentState == appliedByBrick) {
            runCatching {
                app.packageManager.setComponentEnabledSetting(
                    component,
                    originalComponentState,
                    PackageManager.DONT_KILL_APP
                )
            }.getOrElse { return false }
        }

        val cleared = prefs.edit()
            .putBoolean(KEY_ACTIVE, false)
            .putLong(KEY_REACTIVATED_AT, System.currentTimeMillis())
            .commit()
        if (!cleared) return false

        if (DeviceRoleStore.role(app) == DeviceRoleStore.Role.CHILD) {
            runCatching { DiagnosticMonitor.start(app) }
            runCatching { FallDetectorRuntime.start(app) }
            runCatching { RecoveryScheduler.ensureScheduled(app) }
            runCatching { ServiceControl.ensureTracking(app) }
        }
        return true
    }

    fun quiesce(context: Context) {
        val app = context.applicationContext
        // Stop process-local loops first. In post-purge mode do not touch any purged Brick store or
        // schedule; the only durable state allowed to remain is the deprovision stage itself.
        runCatching { FallDetectorRuntime.stop() }
        runCatching { DiagnosticMonitor.stop() }
        runCatching { app.stopService(Intent(app, BrickLocationService::class.java)) }
        if (DeprovisionManager.isPostPurge(app)) return

        runCatching { RecoveryScheduler.cancelAll(app) }
        runCatching {
            app.packageManager.setComponentEnabledSetting(
                ComponentName(app, BrickLocationService::class.java),
                BRICK_DEEP_OFF_COMPONENT_STATE,
                PackageManager.DONT_KILL_APP
            )
        }
    }

    private fun validComponentState(state: Int): Boolean = state in setOf(
        PackageManager.COMPONENT_ENABLED_STATE_DEFAULT,
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
        PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
        PackageManager.COMPONENT_ENABLED_STATE_DISABLED_USER,
        PackageManager.COMPONENT_ENABLED_STATE_DISABLED_UNTIL_USED
    )
}
