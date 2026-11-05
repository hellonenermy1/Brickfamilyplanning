package com.brick.safety.maintenance

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.UserManager
import android.provider.Settings
import android.util.AtomicFile
import com.brick.safety.beta.BetaSafety
import com.brick.safety.crypto.DeviceKeys
import com.brick.safety.diagnostics.DiagnosticMonitor
import com.brick.safety.reliability.FallDetectorRuntime
import com.brick.safety.managed.BrickDeviceAdminReceiver
import com.brick.safety.location.BrickServiceQuiescenceGate
import com.brick.safety.privileged.ShizukuBridgeController
import com.brick.safety.reliability.RecoveryScheduler
import java.io.File
import java.io.FileOutputStream
import java.security.KeyStore

/** Production V1 deprovisioner. All transitions are durable and monotonic. */
object DeprovisionManager {
    private const val PREFS = "brick_deprovision_v1"
    private const val KEY_STAGE = "stage"
    private const val KEY_EVER_STARTED = "deprovisionEverStarted"
    private const val KEY_UPDATED_AT = "updatedAtMs"
    private const val ORIGIN_GUARD_FILE = "brick_deprovision_origin_v1.guard"
    private const val ORIGIN_GUARD_CONTENT = "BRICK_DEPROVISION_STARTED_V1"

    /**
     * Brick-owned SQLite databases. Library-owned databases (for example WorkManager internals) are
     * audited separately; this list is only for schemas Brick directly owns and can verify safely.
     */
    private val brickDatabases = listOf(
        "brick_journal.db",
        "brick_safety_outbox.db",
        "brick_crash_outbox.db",
        "brick_evidence.db",
        "brick_diagnostics.db",
        "brick_beta_readiness.db"
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
        "brick_capability_profile_v1",
        "brick_ble_anchors"
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
     * A deliberately tiny, independent provenance anchor retained in no-backup app-private
     * storage until Android uninstalls Brick. It contains no account, location, keys or timestamps.
     * The main deprovision preference and this file cannot both be lost without making a post-
     * purge installation indistinguishable from a clean installation. That boundary is documented.
     */
    internal fun originGuardFile(context: Context): File =
        File(context.applicationContext.noBackupFilesDir, ORIGIN_GUARD_FILE)

    private fun originGuardSidecarExists(context: Context): Boolean {
        val base = originGuardFile(context)
        return File(base.path + ".new").exists() || File(base.path + ".bak").exists()
    }

    private fun originGuardValid(context: Context): Boolean {
        val base = originGuardFile(context)
        if (!base.exists() || originGuardSidecarExists(context)) return false
        return runCatching { base.readText(Charsets.UTF_8) == ORIGIN_GUARD_CONTENT }.getOrDefault(false)
    }

    // Do not use DeprovisionManager's singleton monitor for migration. A late DeviceKeys
    // operation may hold the signer monitor while reading its stage, while purge holds the
    // DeprovisionManager monitor and waits for DeviceKeys. The guard's file alone needs a lock.
    private val originGuardMonitor = Any()

    /** AtomicFile writes/flushes the independent marker before first stage commit. */
    private fun ensureOriginGuard(context: Context): Boolean = synchronized(originGuardMonitor) {
        if (originGuardValid(context)) return@synchronized true
        val base = originGuardFile(context)
        if (base.exists() || originGuardSidecarExists(context)) return@synchronized false
        val atomic = AtomicFile(base)
        var output: FileOutputStream? = null
        try {
            val stream = atomic.startWrite()
            output = stream
            stream.write(ORIGIN_GUARD_CONTENT.toByteArray(Charsets.UTF_8))
            atomic.finishWrite(stream)
            originGuardValid(context)
        } catch (_: Throwable) {
            output?.let { runCatching { atomic.failWrite(it) } }
            false
        }
    }

    /**
     * Missing metadata is "fresh NONE" only when there is no prior deprovision origin in either
     * independent store. Unknown values, wrong stored types, an interrupted guard write, lost
     * stage XML after a completed purge, or conflicting provenance are INVALID (quiesced).
     * Old accepted-stage records with the original in-XML marker are migrated to the independent
     * guard before they may progress. A bad or truncated existing guard is NEVER auto-repaired.
     */
    fun stage(context: Context): Stage = runCatching {
        val app = context.applicationContext
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val everStarted = prefs.getBoolean(KEY_EVER_STARTED, false)
        val base = originGuardFile(app)
        val guardPresent = base.exists() || originGuardSidecarExists(app)
        if (guardPresent && !originGuardValid(app)) return@runCatching Stage.INVALID

        val parsed = if (!prefs.contains(KEY_STAGE)) Stage.NONE else {
            prefs.getString(KEY_STAGE, null)?.let { Stage.valueOf(it) } ?: Stage.INVALID
        }
        when {
            parsed == Stage.INVALID -> Stage.INVALID
            parsed == Stage.NONE -> if (everStarted || guardPresent) Stage.INVALID else Stage.NONE
            !everStarted -> Stage.INVALID
            guardPresent -> parsed
            // Source compatibility for a pre-guard, but correctly marked, in-progress V1 RC.
            // If the repair cannot be committed, remain safely stopped and require attention.
            ensureOriginGuard(app) -> parsed
            else -> Stage.INVALID
        }
    }.getOrDefault(Stage.INVALID)

    /**
     * The INVALID state is deliberately handled as quiesced for all independently invoked Android
     * entry points, but is never falsely labelled as successfully purged.
     */
    fun isPostPurge(context: Context): Boolean {
        val current = stage(context)
        return current == Stage.INVALID || current.ordinal >= Stage.PURGE_BRICK.ordinal
    }

    private val automaticRemoval = java.util.concurrent.atomic.AtomicBoolean(false)

    /** Deliberately invoked by local confirmation only. Never part of readiness/canary/expiry. */
    fun runAuthorisedRemoval(context: Context, progress: (Result) -> Unit = {}): Result {
        check(android.os.Looper.myLooper() != android.os.Looper.getMainLooper()) { "Removal must run off the UI thread" }
        if (!automaticRemoval.compareAndSet(false, true)) return Result(stage(context), false, "removal already running")
        try {
            repeat(6) {
                val result = when (stage(context)) {
                    Stage.INVALID -> Result(Stage.INVALID, false, "invalid provenance; authorised repair required")
                    Stage.NONE -> authoriseFreeze(context)
                    Stage.AUTHORISE_FREEZE -> quiesce(context)
                    Stage.QUIESCE -> undoDeviceManagement(context)
                    Stage.UNDO_DEVICE_MANAGEMENT -> purgeBrick(context)
                    Stage.PURGE_BRICK, Stage.UNINSTALL -> uninstall(context)
                }
                progress(result)
                if (!result.ok || result.stage == Stage.UNINSTALL) return result
            }
            return Result(stage(context), false, "unexpected removal transition")
        } finally { automaticRemoval.set(false) }
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

        if (!com.brick.safety.beta.BetaDiagnostics.quiesceForRemoval()) {
            return Result(stage(app), false, "Beta diagnostics writer/network task not fully quiesced")
        }

        // Stop independently running optional/provider state before deleting its preferences/keys.
        // Failure to contact Shizuku is harmless; shutdown() also clears the local bridge and rotates
        // its executor, while the UserService has an idle-exit guard as a final fallback.
        runCatching { ShizukuBridgeController.shutdownForDeprovision() }

        // WorkManager cancellation is explicitly best-effort. PURGE may not proceed until every
        // Brick-owned unique chain has reached a terminal state, its cancellation operations have
        // completed, terminal rows are pruned, and a final query proves no Brick WorkInfo remains.
        if (!RecoveryScheduler.cancelAllAndAwaitForDeprovision(app)) {
            return Result(stage(app), false, "Brick scheduled work did not quiesce within the verified boundary")
        }
        // stopService() and Executor.shutdownNow() are asynchronous. A running callback can
        // otherwise outlive PURGE's deletion loop and recreate wiped private data. Require real
        // service + five executor termination before touching databases, preferences or Keystore.
        if (!BrickServiceQuiescenceGate.awaitQuiescent(25_000L)) {
            return Result(stage(app), false, "Brick tracking service or in-flight writer not fully stopped")
        }
        if (!DiagnosticMonitor.awaitQuiescent(5_000L)) {
            return Result(stage(app), false, "Brick diagnostics writer not fully stopped")
        }
        if (!FallDetectorRuntime.awaitQuiescent(5_000L)) {
            return Result(stage(app), false, "Brick fall-safety handler not fully stopped")
        }

        // The signer monitor covers the WHOLE deletion boundary, not just Keystore aliases:
        // an admitted old signing task may still be persisting its paired-key fingerprint.
        // Waiting only at key deletion would allow a late preference commit after prefs purge.
        // Do not hold the lock during WorkManager/service/diagnostic/fall termination waits above.
        return synchronized(DeviceKeys) {
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

            // AtomicFile uses a base file plus a possible pending ".new" write and legacy ".bak"
            // backup. Deleting only the base is insufficient for privacy-safe purge: a crash before
            // finishWrite() may leave private learning/location data in a sidecar.
            for (name in brickFiles) {
                for (suffix in listOf("", ".new", ".bak")) {
                    val fileName = name + suffix
                    val file = File(app.filesDir, fileName)
                    if (file.exists() && !runCatching { file.delete() }.getOrDefault(false)) {
                        return Result(stage(app), false, "file purge failed: $fileName")
                    }
                    if (file.exists()) return Result(stage(app), false, "file remains after purge: $fileName")
                }
            }

            // Synchronize with DeviceKeys.getOrCreate/sign so a cryptographic call admitted just
            // before AUTHORISE_FREEZE cannot finish creating/reusing the identity after its deletion.
            // Never hold this lock while waiting on the Android main thread or WorkManager.
            val keyStorePurged = runCatching {
                val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
                brickKeyAliases.forEach { alias -> if (ks.containsAlias(alias)) ks.deleteEntry(alias) }
                brickKeyAliases.none { ks.containsAlias(it) }
            }.getOrDefault(false)
            if (!keyStorePurged) return Result(stage(app), false, "Brick Keystore purge failed")

            val ok = persist(app, Stage.PURGE_BRICK)
            Result(stage(app), ok, if (ok) "Brick local state purged and verified" else "failed to persist purge stage")
        }
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
        // Persist the independent, non-sensitive AtomicFile provenance guard first. A failed
        // stage commit can at worst leave INVALID/recovery-required; it cannot re-enable tracking.
        if (!ensureOriginGuard(context)) return false
        // Stage and in-preference origin marker share one synchronous transaction.
        return context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_EVER_STARTED, true)
            .putString(KEY_STAGE, target.name)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            .commit()
    }
}
