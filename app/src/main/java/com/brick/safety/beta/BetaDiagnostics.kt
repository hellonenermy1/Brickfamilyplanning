package com.brick.safety.beta

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.brick.safety.BuildConfig
import com.brick.safety.crypto.JournalCipher
import com.brick.safety.data.Journal
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.maintenance.DeprovisionManager
import com.brick.safety.maintenance.DeviceRoleStore
import com.brick.safety.managed.BrickDeviceAdminReceiver
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStream
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.locks.ReentrantReadWriteLock
import com.brick.safety.beta.BetaReadinessModel.Check
import com.brick.safety.beta.BetaReadinessModel.Status

/** Beta-only, local maintenance entry. Diagnostics never manufacture real location/safety records. */
object BetaDiagnostics {
    private val fence = ReentrantReadWriteLock(true)
    private val stopped = AtomicBoolean(false)
    private val uploading = AtomicBoolean(false)
    private val uploader = Executors.newSingleThreadExecutor()
    private val storage = Any()
    @Volatile private var recorderHealthy = true
    private fun active(c: Context) = BuildConfig.BRICK_BETA_DIAGNOSTICS && !stopped.get() &&
        DeprovisionManager.stage(c) == DeprovisionManager.Stage.NONE && !DeepOffManager.isActive(c)
    private fun <T> admitted(context: Context, action: () -> T): T {
        check(active(context)) { "beta_runtime_quiesced" }
        check(fence.readLock().tryLock(100, TimeUnit.MILLISECONDS)) { "beta_runtime_busy" }
        try { check(active(context)) { "beta_runtime_quiesced" }; return action() }
        finally { fence.readLock().unlock() }
    }
    private fun <T> store(c: Context, action: (BetaRunStore) -> T): T = synchronized(storage) {
        BetaRunStore(c.applicationContext).use(action)
    }
    /** Freeze admission before purge, then prove every already admitted writer/network task exited. */
    fun quiesceForRemoval(): Boolean {
        stopped.set(true); uploader.shutdownNow()
        val locked = fence.writeLock().tryLock(25, TimeUnit.SECONDS)
        if (!locked) return false
        fence.writeLock().unlock()
        return uploader.awaitTermination(5, TimeUnit.SECONDS)
    }
    private fun binding(c: Context): String {
        val p = c.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val origin = p.getString("apiBase", null)?.let { BetaApi.origin(it) } ?: "unpaired"
        val data = p.getString("deviceId", "unpaired") + "|" + origin
        return MessageDigest.getInstance("SHA-256").digest(data.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }
    fun runChecks(context: Context): JSONObject = admitted(context) {
        val c = context.applicationContext; val checks = mutableListOf<Check>()
        fun add(id: String, status: Status, text: String, required: Boolean = true) { checks += Check(id, status, text, required) }
        add("build_identity", if (BuildConfig.BRICK_SOURCE_SHA.matches(Regex("[0-9a-f]{40}")) && !BuildConfig.BRICK_BETA && BuildConfig.BRICK_BETA_EXPIRY_EPOCH_MS == 0L) Status.PASS else Status.FAIL,
            "${BuildConfig.VERSION_NAME}; release ${BuildConfig.BRICK_RELEASE_ID}; expiry disabled=${!BuildConfig.BRICK_BETA}")
        add("role", if (DeviceRoleStore.role(c) == DeviceRoleStore.Role.CHILD) Status.PASS else Status.PENDING, "Child must be explicitly paired; parent role is not tracked")
        val permissions = listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_BACKGROUND_LOCATION, Manifest.permission.ACTIVITY_RECOGNITION) +
            if (Build.VERSION.SDK_INT >= 33) listOf(Manifest.permission.POST_NOTIFICATIONS) else emptyList()
        val missing = permissions.filter { ContextCompat.checkSelfPermission(c, it) != PackageManager.PERMISSION_GRANTED }
        add("permissions", if (missing.isEmpty()) Status.PASS else Status.FAIL, if (missing.isEmpty()) "Required permissions granted" else "Required: ${missing.joinToString { it.substringAfterLast('.') }}")
        val dpm = c.getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(c, BrickDeviceAdminReceiver::class.java)
        val managed = dpm.isDeviceOwnerApp(c.packageName) && dpm.isAdminActive(admin)
        add("management", if (managed) Status.PASS else Status.PENDING, "Actual Device Owner and active admin required for managed qualification")
        val health = store(c) { it.get("latestHealth")?.let(::JSONObject) }
        val age = health?.let { System.currentTimeMillis() - it.optLong("recordedAtMs", 0) }
        val locationAge = if (health == null || health.isNull("locationAgeMs")) null else health.optLong("locationAgeMs", -1L)
        val interval = health?.optLong("trackingIntervalMs", 120_000L)?.coerceIn(1_000L, 120_000L) ?: 120_000L
        val tracking = age != null && age in 0..180_000 && locationAge != null && locationAge in 0..(interval * 3 + 60_000) &&
            (health?.optBoolean("locationSubscribed") == true) && c.getSystemService(LocationManager::class.java).isLocationEnabled
        add("tracking", if (tracking) Status.PASS else Status.PENDING, "Fresh subscribed tracking evidence required; age=${locationAge ?: "unavailable"}ms, expected cadence=${interval}ms")
        try { journalProbe(c); add("journal", Status.PASS, "Encrypted isolated probe committed in actual journal, closed/reopened/read back; quick_check ok") }
        catch (_: Exception) { add("journal", Status.FAIL, "Actual journal persistence/readback failed") }
        val cm = c.getSystemService(ConnectivityManager::class.java)
        val online = cm.activeNetwork?.let { cm.getNetworkCapabilities(it)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) } == true
        add("network", if (online) Status.PASS else Status.PENDING, "Validated connectivity required for end-to-end readiness; offline storage is assessed separately")
        add("recorder", if (recorderHealthy) Status.PASS else Status.FAIL, "Local beta observation writer health")
        val prefs = c.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val base = prefs.getString("apiBase", null); val device = prefs.getString("deviceId", null)
        if (base == null || device == null || !online) {
            add("backend_identity", Status.PENDING, "Pair the phone with the Phase2 beta environment")
            BetaReadinessModel.backendChecks.forEach { add(it, Status.PENDING, "Phase2 end-to-end proof pending") }
        } else {
            try {
                val result = BetaApi.request(base, device, "readiness")
                add("backend_identity", Status.PASS, "Matching beta release and fresh nonce; backend source ${result.getString("backendSourceSha")}")
                val server = result.optJSONArray("checks") ?: JSONArray()
                BetaReadinessModel.backendChecks.forEach { id ->
                    val matches = (0 until server.length()).mapNotNull { server.optJSONObject(it) }.filter { it.optString("id") == id }
                    val raw = matches.singleOrNull()
                    val status = raw?.optString("status")?.let { runCatching { Status.valueOf(it) }.getOrNull() } ?: Status.PENDING
                    val detail = raw?.optString("detailCode")?.takeIf { it.matches(Regex("[a-zA-Z0-9_.-]{1,80}")) } ?: "proof_missing_or_duplicate"
                    add(id, status, detail)
                }
            } catch (_: BetaApi.BackendPending) {
                add("backend_identity", Status.PENDING, "Beta readiness endpoint not deployed; Phase2 pending")
                BetaReadinessModel.backendChecks.forEach { add(it, Status.PENDING, "Phase2 proof pending; echo/HTTP200 alone is insufficient") }
            } catch (_: Exception) {
                add("backend_identity", Status.FAIL, "Beta authentication, release identity, clock or transport check failed; no response payload logged")
                BetaReadinessModel.backendChecks.forEach { add(it, Status.PENDING, "No valid backend proof") }
            }
        }
        val sensor = c.getSystemService(android.hardware.SensorManager::class.java)
        val missingSensors = listOf(android.hardware.Sensor.TYPE_ACCELEROMETER, android.hardware.Sensor.TYPE_GYROSCOPE).count { sensor.getDefaultSensor(it) == null }
        add("optional_sensors", if (missingSensors == 0) Status.PASS else Status.UNSUPPORTED, "Runtime-exposed accelerometer/gyroscope; other providers retain existing capability/health reporting", false)
        val report = JSONObject().put("format", "brick-beta-readiness-v1").put("releaseId", BuildConfig.BRICK_RELEASE_ID)
            .put("apkSourceSha", BuildConfig.BRICK_SOURCE_SHA).put("checkedAtMs", System.currentTimeMillis()).put("bindingHash", binding(c))
            .put("coreReady", BetaReadinessModel.ready(checks)).put("checks", JSONArray(checks.map { JSONObject().put("id", it.id).put("status", it.status.name).put("required", it.required).put("detail", it.detail) }))
            .put("limits", "Readiness is scoped evidence, not production qualification or proof that every feature works")
        check(active(c)) { "beta_runtime_quiesced" }
        store(c) { it.put("readiness", report.toString()) }; report
    }
    private fun journalProbe(c: Context) {
        val nonce = UUID.randomUUID().toString().toByteArray(Charsets.UTF_8)
        Journal(c).use { j ->
            j.writableDatabase.execSQL("CREATE TABLE IF NOT EXISTS beta_diagnostic_probe(k INTEGER PRIMARY KEY CHECK(k=1),v BLOB NOT NULL)")
            j.writableDatabase.execSQL("INSERT OR REPLACE INTO beta_diagnostic_probe(k,v) VALUES(1,?)", arrayOf(JournalCipher.encrypt(nonce)))
        }
        Journal(c).use { j ->
            j.readableDatabase.rawQuery("SELECT v FROM beta_diagnostic_probe WHERE k=1", null).use { cursor ->
                check(cursor.moveToFirst() && JournalCipher.decrypt(cursor.getBlob(0)).contentEquals(nonce))
            }
            j.readableDatabase.rawQuery("PRAGMA quick_check", null).use { check(it.moveToFirst() && it.getString(0) == "ok") }
            j.writableDatabase.delete("beta_diagnostic_probe", null, null)
        }
    }
    private fun canStart(c: Context, report: JSONObject): Boolean {
        val age = System.currentTimeMillis() - report.optLong("checkedAtMs", 0)
        val a = report.optJSONArray("checks") ?: return false
        val checks = (0 until a.length()).map { i -> val v = a.getJSONObject(i); Check(v.getString("id"), Status.valueOf(v.getString("status")), "", v.getBoolean("required")) }
        return age in 0..300_000 && report.optString("apkSourceSha") == BuildConfig.BRICK_SOURCE_SHA &&
            report.optString("bindingHash") == binding(c) && BetaReadinessModel.ready(checks)
    }
    fun startRun(c: Context, escapeVerifiedByUser: Boolean) = admitted(c) {
        check(escapeVerifiedByUser) { "physical_escape_verification_required" }
        store(c) { s -> check(s.get("run") == null) { "export_and_reset_previous_beta_run_first" }; check(canStart(c, JSONObject(s.get("readiness") ?: error("run_readiness_first")))) { "readiness_pending_or_stale" }; s.start(binding(c)) }
    }
    fun recordIntervention(c: Context, reason: String) = admitted(c) {
        require(reason in setOf("PLANNED_NETWORK_TEST", "PLANNED_DEVICE_REBOOT", "UNPLANNED_RECOVERY", "OTHER_USER_ACTION"))
        store(c) { s ->
            check(s.get("active") == "true") { "no_active_run" }
            val events = s.get("interventions")?.let(::JSONArray) ?: JSONArray()
            check(events.length() < 200) { "intervention_limit_export_run" }
            events.put(JSONObject().put("atMs", System.currentTimeMillis()).put("elapsedMs", SystemClock.elapsedRealtime()).put("reason", reason))
            s.put("interventions", events.toString())
        }
    }
    fun stopRun(c: Context) = admitted(c) { store(c) { it.put("active", "false"); it.put("stopReason", "user_stopped_review_required") } }
    fun resetRun(c: Context) = admitted(c) { store(c) {
        check(it.get("active") != "true") { "stop_run_first" }; check(it.get("exported") == "true") { "export_run_first" }
        it.writableDatabase.delete("records", null, null); it.writableDatabase.delete("meta", null, null)
    } }
    fun summary(c: Context): JSONObject = admitted(c) { store(c) { JSONObject().put("readiness", it.get("readiness")?.let(::JSONObject) ?: JSONObject.NULL).put("endurance", it.summary()) } }
    fun observe(c: Context, source: JSONObject) {
        if (!active(c)) return
        runCatching { admitted(c) {
            val fields = listOf("serviceUptimeMs", "locationAgeMs", "locationCallbackAgeMs", "ackAgeMs", "pendingRecords", "pendingSafetyEvents", "oldestPendingAgeMs", "network", "locationEnabled", "locationSubscribed", "batteryPct", "charging", "activityMode", "trackingIntervalMs", "recoveryCount", "healthSequence", "networkValidated", "journalWriteHealthy")
            val safe = JSONObject().put("recordedAtMs", System.currentTimeMillis())
            fields.forEach { if (source.has(it)) safe.put(it, source.get(it)) }
            store(c) { s ->
                val run = s.get("run")?.let(::JSONObject)
                if (s.get("active") == "true" && run?.optString("bindingHash") != binding(c)) { s.put("active", "false"); s.put("stopReason", "paired_identity_changed_new_segment_required") }
                s.sample(safe)
            }; recorderHealthy = true
        } }.onFailure { recorderHealthy = false }
        if (uploading.compareAndSet(false, true)) {
            try { uploader.execute { try { upload(c.applicationContext) } finally { uploading.set(false) } } }
            catch (_: java.util.concurrent.RejectedExecutionException) { uploading.set(false) }
        }
    }
    private fun upload(c: Context) {
        runCatching { admitted(c) {
            val batch = store(c) { s ->
                val now = SystemClock.elapsedRealtime(); val last = s.get("lastUploadElapsed")?.toLongOrNull() ?: -1L
                val boot = android.provider.Settings.Global.getInt(c.contentResolver, android.provider.Settings.Global.BOOT_COUNT, -1)
                val lastBoot = s.get("uploadBoot")?.toIntOrNull()
                val delay = s.get("uploadDelayMs")?.toLongOrNull() ?: 60_000L
                if (s.get("active") != "true" || (lastBoot == boot && now >= last && now - last < delay)) return@store null
                s.put("lastUploadElapsed", now.toString()); s.put("uploadBoot", boot.toString()); s.put("uploadDelayMs", "60000")
                val records = s.batch(); if (records.length() == 0) return@store null
                JSONObject().put("run", JSONObject(s.get("run") ?: error("missing_run"))).put("records", records).put("droppedRecords", s.get("dropped")?.toLongOrNull() ?: 0)
            } ?: return@admitted
            val p = c.getSharedPreferences("brick", Context.MODE_PRIVATE)
            val result = BetaApi.request(p.getString("apiBase", null) ?: return@admitted, p.getString("deviceId", null) ?: return@admitted, "observations", batch)
            val rows = batch.getJSONArray("records"); val last = rows.getJSONObject(rows.length() - 1).getLong("id")
            val ack = result.optLong("acceptedThroughId", -1)
            check(ack == last && result.optString("runId") == batch.getJSONObject("run").getString("runId"))
            check(active(c))
            store(c) {
                check(it.get("active") == "true" && JSONObject(it.get("run") ?: error("run_missing")).getString("runId") == batch.getJSONObject("run").getString("runId")) { "run_changed_during_upload" }
                check(ack >= (it.get("acked")?.toLongOrNull() ?: 0)); it.put("acked", ack.toString()); it.put("lastUploadElapsed", SystemClock.elapsedRealtime().toString()); it.put("uploadDelayMs", "900000") }
        } }
    }
    fun export(c: Context, output: OutputStream) = admitted(c) {
        val result = store(c) { JSONObject().put("format", "brick-beta-observations-v1").put("releaseId", BuildConfig.BRICK_RELEASE_ID)
            .put("apkSourceSha", BuildConfig.BRICK_SOURCE_SHA).put("summary", it.summary()).put("readiness", it.get("readiness")?.let(::JSONObject) ?: JSONObject.NULL)
            .put("records", it.batch(6000, pendingOnly = false)) }
        output.write(result.toString(2).toByteArray(Charsets.UTF_8)); output.flush()
        result.getJSONObject("summary").optJSONObject("run")?.optString("runId") ?: ""
    }
    fun markExported(c: Context, runId: String): Boolean = admitted(c) { store(c) {
        val current = it.get("run")?.let(::JSONObject)?.optString("runId") ?: ""
        if (it.get("active") != "true" && current == runId) { it.put("exported", "true"); true } else false
    } }
}
