package com.brick.safety.maintenance

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.UserManager
import android.provider.Settings
import com.brick.safety.beta.BetaSafety
import com.brick.safety.managed.BrickDeviceAdminReceiver
import com.brick.safety.privileged.ShizukuBridgeController
import com.brick.safety.reliability.RecoveryScheduler
import java.io.File
import java.security.KeyStore

/** Production V1 deprovisioner. All transitions are durable and monotonic. */
object DeprovisionManager {
    private const val PREFS = "brick_deprovision_v1"
    private const val KEY_STAGE = "stage"
    private const val KEY_EVER_STARTED = "deprovisionEverStarted"
    private const val KEY_UPDATED_AT = "updatedAtMs"

    /**
     * Brick-owned SQLite databases. Library-owned databases (for example WorkManager internals) are
     * audited separately; this list is only for schemas Brick directly owns and can verify safely.
     */
    private val brickDatabases = listOf(
        "brick_journal.db",
        "brick_safety_outbox.db",
        "brick_crash_outbox.db",
        "brick_evidence.db",
        "brick_diagnostics.db"
    )

    /** Every SharedPreferences namespace directly owned by Brick production/upgrade code. */
    private val brickPreferences = listOf(
        "brick",
        "brick_position",
        "brick_activity",
        "brick_companion_presence",
        "brick_beta_safety",
        "brick_parent_location",
        "brick_managed_policy_p8",
        "brick_diag_state",
        "brick_diag_flags",
        "brick_diagnostics",
        "brick_policy_ledger_v1",
        "brick_deep_off_v1",
        "brick_live_track_v1",
        "brick_wifi_schedule_v1",
        "brick_canary_v1",
        "brick_device_role_v1",
        "brick_capability_profile_v1"
    )

    /** Encrypted files directly owned by Brick. */
    private val brickFiles = listOf(
        "brick_phase3_state.bin",
        "brick_atlas_v1.bin",
        "brick_learned_places_v1.bin"
    )

    /** Non-exportable Android Keystore identities/secrets directly owned by Brick. */
    private val brickKeyAliases = listOf(
        "brick-device-signing-v1",
        "brick-journal-aes-v1",
        "brick-witness-alias-hmac-v1",
        "brick_atlas_hmac_v1"
    )

    enum class Stage { INVALID, NONE, AUTHORISE_FREEZE, QUIESCE, UNDO_DEVICE_MANAGEMENT, PURGE_BRICK, UNINSTALL }
    data class Result(val stage: Stage, val ok: Boolean, val detail: String)

    /**
     * Missing state is a fresh install only if no previous deprovision transition was recorded.
     * Present-but-invalid values, wrong SharedPreferences types, or rollback to NONE after the
     * durable origin marker must fail closed. Do not turn unknown provenance into normal startup.
     */
    fun stage(context: Context): Stage {
        return runCatching {
            val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val everStarted = prefs.getBoolean(KEY_EVER_STARTED, false)
            if (!prefs.contains(KEY_STAGE)) {
                if (everStarted) Stage.INVALID else Stage.NONE
            } else {
                val raw = prefs.getString(KEY_STAGE, null)
                val parsed = raw?.let { Stage.valueOf(it) } ?: Stage.INVALID
                if (parsed == Stage.INVALID || (parsed == Stage.NONE && everStarted)) Stage.INVALID else parsed
            }
        }.getOrDefault(Stage.INVALID)
    }

    /**
     * The INVALID state is deliberately handled as quiesced for all independently invoked Android
     * entry points, but is never falsely labelled as successfully purged.
     */
    fun isPostPurge(context: Context): Boolean {
        val current = stage(context)
        return current == Stage.INVALID || current.ordinal >= Stage.PURGE_BRICK.ordinal
    }

    @Synchronized
    fun authoriseFreeze(context: Context): Result {
        val app = context.applicationContext
        val current = stage(app)
        if (current == Stage.INVALID) return Result(current, false, "deprovision state invalid; repair required")
        if (current.ordinal >= Stage.AUTHORISE_FREEZE.ordinal) return Result(current, true, "already authorised")
        val ok = persist(app, Stage.AUTHORISE_FREEZE)
        return Result(stage(app), ok, if (ok) "authorised and frozen" else "failed to persist authorisation")
    }

    @Synchronized
    fun quiesce(context: Context): Result {
        val app = context.applicationContext
        if (stage(app).ordinal < Stage.AUTHORISE_FREEZE.ordinal) return Result(stage(app), false, "authorisation required")
        if (!DeepOffManager.enter(app)) return Result(stage(app), false, "Deep Off could not be made durable")
        val ok = persist(app, Stage.QUIESCE)
        return Result(stage(app), ok, if (ok) "Brick runtime quiesced" else "failed to persist quiesce stage")
    }

    @Synchronized
    fun undoDeviceManagement(context: Context): Result {
        val app = context.applicationContext
        if (stage(app).ordinal < Stage.QUIESCE.ordinal) return Result(stage(app), false, "quiesce required")
        if (!reverseBrickPolicies(app)) return Result(stage(app), false, "policy reversal incomplete or provenance invalid")
        val released = BetaSafety.releaseDeviceOwner(app)
        if (!released.released) return Result(stage(app), false, released.error ?: "Device Owner/admin still active")
        val ok = persist(app, Stage.UNDO_DEVICE_MANAGEMENT)
        return Result(stage(app), ok, if (ok) "Brick management reversed and released" else "failed to persist management-release stage")
    }

    @Synchronized
    fun purgeBrick(context: Context): Result {
        val app = context.applicationContext
        if (stage(app).ordinal < Stage.UNDO_DEVICE_MANAGEMENT.ordinal) {
            return Result(stage(app), false, "management release required")
        }

        // Stop independently running optional/provider state before deleting its preferences/keys.
        // Failure to contact Shizuku is harmless; shutdown() also clears the local bridge and rotates
        // its executor, while the UserService has an idle-exit guard as a final fallback.
        runCatching { ShizukuBridgeController.shutdown() }

        // WorkManager cancellation is explicitly best-effort. PURGE may not proceed until every
        // Brick-owned unique chain has reached a terminal state, its cancellation operations have
        // completed, terminal rows are pruned, and a final query proves no Brick WorkInfo remains.
        if (!RecoveryScheduler.cancelAllAndAwaitForDeprovision(app)) {
            return Result(stage(app), false, "Brick scheduled work did not quiesce within the verified boundary")
        }

        for (name in brickDatabases) {
            val path = app.getDatabasePath(name)
            if (path.exists()) {
                val deleted = runCatching { app.deleteDatabase(name) }.getOrDefault(false)
                if (!deleted || path.exists()) return Result(stage(app), false, "database purge failed: $name")
            }
        }

        for (name in brickPreferences) {
            val prefs = app.getSharedPreferences(name, Context.MODE_PRIVATE)
            val committed = runCatching { prefs.edit().clear().commit() }.getOrDefault(false)
            if (!committed || prefs.all.isNotEmpty()) return Result(stage(app), false, "preference purge failed: $name")
        }

        for (name in brickFiles) {
            val file = File(app.filesDir, name)
            if (file.exists() && !runCatching { file.delete() }.getOrDefault(false)) {
                return Result(stage(app), false, "file purge failed: $name")
            }
            if (file.exists()) return Result(stage(app), false, "file remains after purge: $name")
        }

        val keyStorePurged = runCatching {
            val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            brickKeyAliases.forEach { alias -> if (ks.containsAlias(alias)) ks.deleteEntry(alias) }
            brickKeyAliases.none { ks.containsAlias(it) }
        }.getOrDefault(false)
        if (!keyStorePurged) return Result(stage(app), false, "Brick Keystore purge failed")

        val ok = persist(app, Stage.PURGE_BRICK)
        return Result(stage(app), ok, if (ok) "Brick local state purged and verified" else "failed to persist purge stage")
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
        if (!PolicyLedger.integrityValid(context)) return false

        runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION) }
        runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_CHANGE_WIFI_STATE) }

        for (entry in PolicyLedger.active(context)) {
            val reversed = when {
                entry.policy == "restriction:${UserManager.DISALLOW_CONFIG_DATE_TIME}" -> {
                    val current = runCatching {
                        dpm.getUserRestrictions(admin).getBoolean(UserManager.DISALLOW_CONFIG_DATE_TIME, false)
                    }.getOrNull()
                    if (current == null) {
                        false
                    } else if (current && entry.brickValue == "true") {
                        runCatching { dpm.clearUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME) }.isSuccess
                    } else {
                        entry.brickValue == "true" && entry.previousValue == "false"
                    }
                }

                entry.policy == "auto_time" -> {
                    if (Build.VERSION.SDK_INT < 30) {
                        false
                    } else {
                        val current = runCatching {
                            Settings.Global.getInt(context.contentResolver, Settings.Global.AUTO_TIME, 1) != 0
                        }.getOrNull()
                        val brick = entry.brickValue?.toBooleanStrictOrNull()
                        val previous = entry.previousValue?.toBooleanStrictOrNull()
                        if (current != null && brick != null && previous != null && current == brick) {
                            runCatching { dpm.setAutoTimeEnabled(admin, previous) }.isSuccess
                        } else {
                            current != null && brick != null && previous != null
                        }
                    }
                }

                entry.policy == "auto_time_required" -> {
                    if (Build.VERSION.SDK_INT >= 30) {
                        false
                    } else {
                        val current = runCatching { dpm.getAutoTimeRequired() }.getOrNull()
                        val brick = entry.brickValue?.toBooleanStrictOrNull()
                        val previous = entry.previousValue?.toBooleanStrictOrNull()
                        if (current != null && brick != null && previous != null && current == brick) {
                            runCatching { dpm.setAutoTimeRequired(admin, previous) }.isSuccess
                        } else {
                            current != null && brick != null && previous != null
                        }
                    }
                }

                entry.policy.startsWith("permission:") -> {
                    val permission = entry.policy.removePrefix("permission:")
                    val brickState = entry.brickValue?.toIntOrNull()
                    val previousState = entry.previousValue?.toIntOrNull()
                    if (brickState == null || previousState == null) {
                        false
                    } else {
                        val current = runCatching {
                            dpm.getPermissionGrantState(admin, context.packageName, permission)
                        }.getOrNull()
                        when {
                            current == null -> false
                            current == brickState -> runCatching {
                                dpm.setPermissionGrantState(admin, context.packageName, permission, previousState)
                            }.getOrDefault(false)
                            else -> true
                        }
                    }
                }

                else -> false
            }
            if (!reversed) return false
            if (!PolicyLedger.markReverted(context, entry.id)) return false
        }
        return true
    }

    private fun persist(context: Context, target: Stage): Boolean {
        val current = stage(context)
        if (current == Stage.INVALID || target == Stage.NONE || target == Stage.INVALID) return false
        if (current.ordinal >= target.ordinal) return true
        // Stage and origin marker are one synchronous preference transaction. A missing/truncated
        // stage with a retained origin marker cannot be mistaken for a legitimate fresh install.
        return context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_EVER_STARTED, true)
            .putString(KEY_STAGE, target.name)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            .commit()
    }
}
