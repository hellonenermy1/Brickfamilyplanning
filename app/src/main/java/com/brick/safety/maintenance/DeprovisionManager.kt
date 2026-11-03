package com.brick.safety.maintenance

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.UserManager
import com.brick.safety.beta.BetaSafety
import com.brick.safety.managed.BrickDeviceAdminReceiver
import com.brick.safety.reliability.RecoveryScheduler

/** Production V1 deprovisioner. All transitions are durable and monotonic. */
object DeprovisionManager {
    private const val PREFS = "brick_deprovision_v1"
    private const val KEY_STAGE = "stage"
    private const val KEY_UPDATED_AT = "updatedAtMs"

    enum class Stage {
        NONE,
        AUTHORISE_FREEZE,
        QUIESCE,
        UNDO_DEVICE_MANAGEMENT,
        PURGE_BRICK,
        UNINSTALL
    }

    data class Result(val stage: Stage, val ok: Boolean, val detail: String)

    fun stage(context: Context): Stage {
        val raw = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_STAGE, Stage.NONE.name)
        return runCatching { Stage.valueOf(raw ?: Stage.NONE.name) }.getOrDefault(Stage.NONE)
    }

    @Synchronized
    fun authoriseFreeze(context: Context): Result {
        val app = context.applicationContext
        val current = stage(app)
        if (current.ordinal >= Stage.AUTHORISE_FREEZE.ordinal) return Result(current, true, "already authorised")
        val ok = persist(app, Stage.AUTHORISE_FREEZE)
        return Result(stage(app), ok, if (ok) "authorised and frozen" else "failed to persist authorisation")
    }

    @Synchronized
    fun quiesce(context: Context): Result {
        val app = context.applicationContext
        if (stage(app).ordinal < Stage.AUTHORISE_FREEZE.ordinal) return Result(stage(app), false, "authorisation required")
        DeepOffManager.enter(app)
        val ok = persist(app, Stage.QUIESCE)
        return Result(stage(app), ok, if (ok) "Brick runtime quiesced" else "failed to persist quiesce stage")
    }

    @Synchronized
    fun undoDeviceManagement(context: Context): Result {
        val app = context.applicationContext
        if (stage(app).ordinal < Stage.QUIESCE.ordinal) return Result(stage(app), false, "quiesce required")
        if (!reverseBrickPolicies(app)) return Result(stage(app), false, "policy reversal incomplete")
        val released = BetaSafety.releaseDeviceOwner(app)
        if (!released.released) return Result(stage(app), false, released.error ?: "Device Owner/admin still active")
        val ok = persist(app, Stage.UNDO_DEVICE_MANAGEMENT)
        return Result(stage(app), ok, if (ok) "Brick management reversed and released" else "failed to persist management-release stage")
    }

    @Synchronized
    fun purgeBrick(context: Context): Result {
        val app = context.applicationContext
        if (stage(app).ordinal < Stage.UNDO_DEVICE_MANAGEMENT.ordinal) return Result(stage(app), false, "management release required")

        // Purge location/evidence/safety/diagnostic state before uninstall. The deprovision state is
        // deliberately stored in its own preference file and retained until Android uninstalls Brick.
        val databases = listOf(
            "brick_journal.db", "brick_safety_outbox.db", "brick_crash_outbox.db",
            "brick_evidence.db", "brick_diagnostics.db"
        )
        databases.forEach { runCatching { app.deleteDatabase(it) } }
        listOf(
            "brick", "brick_position", "brick_parent_location", "brick_managed_policy_p8",
            "brick_diag_state", "brick_diag_flags", "brick_policy_ledger_v1", "brick_deep_off_v1"
        ).forEach { name -> runCatching { app.getSharedPreferences(name, Context.MODE_PRIVATE).edit().clear().commit() } }
        runCatching { RecoveryScheduler.cancelAll(app) }

        val ok = persist(app, Stage.PURGE_BRICK)
        return Result(stage(app), ok, if (ok) "Brick local state purged" else "failed to persist purge stage")
    }

    @Synchronized
    fun uninstall(context: Context): Result {
        val app = context.applicationContext
        if (stage(app).ordinal < Stage.PURGE_BRICK.ordinal) return Result(stage(app), false, "purge required")
        if (!persist(app, Stage.UNINSTALL)) return Result(stage(app), false, "failed to persist uninstall stage")
        val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:${app.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching {
            app.startActivity(intent)
            Result(Stage.UNINSTALL, true, "Android uninstall handoff opened")
        }.getOrElse { Result(Stage.UNINSTALL, false, "uninstall handoff failed: ${it.javaClass.simpleName}") }
    }

    @Suppress("DEPRECATION")
    private fun reverseBrickPolicies(context: Context): Boolean {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(context, BrickDeviceAdminReceiver::class.java)
        val owner = runCatching { dpm.isDeviceOwnerApp(context.packageName) }.getOrDefault(false)
        if (!owner) return true

        // Safety cleanup for historical Brick versions, then provenance-aware reversal below.
        runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION) }
        runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_CHANGE_WIFI_STATE) }

        for (entry in PolicyLedger.active(context)) {
            val reversed = when {
                entry.policy == "restriction:${UserManager.DISALLOW_CONFIG_DATE_TIME}" -> {
                    val restrictions = runCatching { dpm.getUserRestrictions(admin) }.getOrNull()
                    val current = restrictions?.getBoolean(UserManager.DISALLOW_CONFIG_DATE_TIME, false)
                    // Revert only if the current state still matches Brick's recorded value.
                    if (current == true && entry.brickValue == "true") {
                        runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME) }.isSuccess
                    } else true
                }
                entry.policy.startsWith("permission:") -> {
                    val permission = entry.policy.removePrefix("permission:")
                    val brickState = entry.brickValue?.toIntOrNull()
                    val previousState = entry.previousValue?.toIntOrNull()
                    if (brickState == null || previousState == null) true else {
                        val current = runCatching { dpm.getPermissionGrantState(admin, context.packageName, permission) }.getOrNull()
                        if (current == brickState) {
                            runCatching { dpm.setPermissionGrantState(admin, context.packageName, permission, previousState) }.getOrDefault(false)
                        } else true
                    }
                }
                else -> true // Unknown/future entries are not blindly modified.
            }
            if (!reversed) return false
            if (!PolicyLedger.markReverted(context, entry.id)) return false
        }
        return true
    }

    private fun persist(context: Context, target: Stage): Boolean {
        val current = stage(context)
        if (current.ordinal > target.ordinal) return true
        if (current.ordinal == target.ordinal) return true
        return context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_STAGE, target.name)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            .commit()
    }
}
