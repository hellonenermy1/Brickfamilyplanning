package com.brick.safety.maintenance

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import com.brick.safety.location.BrickLocationService
import com.brick.safety.reliability.RecoveryScheduler
import com.brick.safety.reliability.ServiceControl
import org.json.JSONObject

/**
 * Reversible production Deep Off.
 *
 * State is committed before active Brick work is stopped. Reboot/startup code consults this durable
 * flag and therefore never auto-reactivates Deep Off. Reactivation is local/explicit only.
 * Deep Off itself does not toggle Location/Wi-Fi/mobile data, so it does not need to restore user
 * radio state and cannot overwrite a later child/system choice.
 */
object DeepOffManager {
    private const val PREFS = "brick_deep_off_v1"
    private const val KEY_ACTIVE = "active"
    private const val KEY_ENTERED_AT = "enteredAtMs"
    private const val KEY_SNAPSHOT = "snapshot"
    private const val KEY_REACTIVATED_AT = "reactivatedAtMs"

    data class Snapshot(
        val active: Boolean,
        val enteredAtMs: Long,
        val paired: Boolean,
        val serviceComponentState: Int,
        val policyLedgerActiveCount: Int
    )

    fun isActive(context: Context): Boolean =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_ACTIVE, false)

    fun snapshot(context: Context): Snapshot {
        val app = context.applicationContext
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
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_ACTIVE, false)) {
            quiesce(app)
            return true
        }

        val component = ComponentName(app, BrickLocationService::class.java)
        val state = app.packageManager.getComponentEnabledSetting(component)
        val snapshot = JSONObject()
            .put("version", 1)
            .put("serviceComponentState", state)
            .put("paired", app.getSharedPreferences("brick", Context.MODE_PRIVATE).contains("deviceId"))
            .put("policyLedgerActiveCount", PolicyLedger.active(app).size)
            .put("capturedAtMs", System.currentTimeMillis())

        // Commit the fail-closed state before stopping anything. If the process dies after this write,
        // startup/boot/recovery will still see Deep Off and remain quiesced.
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
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ACTIVE, false)) return true

        val raw = prefs.getString(KEY_SNAPSHOT, null)
        val originalComponentState = runCatching { JSONObject(raw ?: "{}").optInt("serviceComponentState", PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) }
            .getOrDefault(PackageManager.COMPONENT_ENABLED_STATE_DEFAULT)

        // Only Brick's own service component is restored. Deep Off never changed Location/Wi-Fi/etc,
        // so user/system radio choices made while Deep Off was active remain untouched.
        val component = ComponentName(app, BrickLocationService::class.java)
        runCatching {
            app.packageManager.setComponentEnabledSetting(
                component,
                if (originalComponentState == PackageManager.COMPONENT_ENABLED_STATE_DISABLED) PackageManager.COMPONENT_ENABLED_STATE_DEFAULT else originalComponentState,
                PackageManager.DONT_KILL_APP
            )
        }.getOrElse { return false }

        val cleared = prefs.edit()
            .putBoolean(KEY_ACTIVE, false)
            .putLong(KEY_REACTIVATED_AT, System.currentTimeMillis())
            .commit()
        if (!cleared) return false

        runCatching { RecoveryScheduler.ensureScheduled(app) }
        runCatching { ServiceControl.ensureTracking(app) }
        return true
    }

    fun quiesce(context: Context) {
        val app = context.applicationContext
        runCatching { app.stopService(Intent(app, BrickLocationService::class.java)) }
        runCatching { RecoveryScheduler.cancelAll(app) }
        runCatching {
            app.packageManager.setComponentEnabledSetting(
                ComponentName(app, BrickLocationService::class.java),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            )
        }
    }
}
