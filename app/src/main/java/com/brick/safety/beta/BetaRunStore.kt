package com.brick.safety.beta

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import com.brick.safety.BuildConfig
import com.brick.safety.crypto.JournalCipher
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Called only inside BetaDiagnostics' admission fence. Payloads encrypted; no coordinate/radio fields. */
internal class BetaRunStore(context: Context) : SQLiteOpenHelper(context, "brick_beta_readiness.db", null, 1) {
    private val app = context.applicationContext
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE meta(k TEXT PRIMARY KEY,v TEXT NOT NULL)")
        db.execSQL("CREATE TABLE records(id INTEGER PRIMARY KEY AUTOINCREMENT,payload BLOB NOT NULL)")
    }
    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) = Unit
    fun get(key: String): String? = readableDatabase.rawQuery("SELECT v FROM meta WHERE k=?", arrayOf(key)).use { if (it.moveToFirst()) String(JournalCipher.decrypt(java.util.Base64.getDecoder().decode(it.getString(0))), Charsets.UTF_8) else null }
    fun put(key: String, value: String) { check(writableDatabase.insertWithOnConflict("meta", null, ContentValues().apply { put("k", key); put("v", java.util.Base64.getEncoder().encodeToString(JournalCipher.encrypt(value.toByteArray(Charsets.UTF_8)))) }, SQLiteDatabase.CONFLICT_REPLACE) != -1L) }
    fun start(bindingHash: String) {
        check(get("active") != "true") { "run_already_active" }
        writableDatabase.beginTransaction()
        try {
            writableDatabase.delete("records", null, null)
            writableDatabase.delete("meta", "k IN ('acked','dropped','lastSampleElapsed','lastBoot','lastUploadElapsed','lastSampleWall')", null)
            put("run", JSONObject().put("runId", UUID.randomUUID().toString()).put("startedAtMs", System.currentTimeMillis())
                .put("releaseId", BuildConfig.BRICK_RELEASE_ID).put("apkSourceSha", BuildConfig.BRICK_SOURCE_SHA)
                .put("bindingHash", bindingHash).put("version", BuildConfig.VERSION_NAME).put("model", Build.MODEL).put("android", Build.VERSION.RELEASE)
                .put("osBuild", Build.DISPLAY).put("escapeVerifiedByUser", true).toString())
            put("active", "true"); writableDatabase.setTransactionSuccessful()
        } finally { writableDatabase.endTransaction() }
    }
    fun sample(health: JSONObject) {
        put("latestHealth", health.toString())
        if (get("active") != "true") return
        val run = JSONObject(get("run") ?: error("run_metadata_missing"))
        if (run.optString("apkSourceSha") != BuildConfig.BRICK_SOURCE_SHA || run.optString("releaseId") != BuildConfig.BRICK_RELEASE_ID) {
            put("active", "false"); put("stopReason", "build_changed_new_segment_required"); return
        }
        val elapsed = SystemClock.elapsedRealtime(); val wall = System.currentTimeMillis()
        val boot = Settings.Global.getInt(app.contentResolver, Settings.Global.BOOT_COUNT, -1)
        val last = get("lastSampleElapsed")?.toLongOrNull() ?: -1L
        val oldBoot = get("lastBoot")?.toIntOrNull()
        if (oldBoot == boot && elapsed >= last && elapsed - last < 60_000L) return
        val payload = JSONObject().put("wallMs", wall).put("elapsedMs", elapsed).put("boot", boot)
            .put("health", health).put("sameBootGapMs", if (oldBoot == boot && last >= 0 && elapsed >= last) elapsed - last else JSONObject.NULL)
            .put("bootChanged", oldBoot != null && (oldBoot != boot || elapsed < last))
        val oldWall = get("lastSampleWall")?.toLongOrNull()
        if (oldWall != null && oldBoot == boot && last >= 0) payload.put("clockDeltaMs", (wall - oldWall) - (elapsed - last))
        writableDatabase.beginTransaction()
        try {
            check(writableDatabase.insertOrThrow("records", null, ContentValues().apply { put("payload", JournalCipher.encrypt(payload.toString().toByteArray(Charsets.UTF_8))) }) > 0L)
            put("lastSampleElapsed", elapsed.toString()); put("lastSampleWall", wall.toString()); put("lastBoot", boot.toString())
            val count = readableDatabase.rawQuery("SELECT COUNT(*) FROM records", null).use { it.moveToFirst(); it.getLong(0) }
            if (count > 6000) {
                val excess = count - 6000
                writableDatabase.execSQL("DELETE FROM records WHERE id IN (SELECT id FROM records ORDER BY id LIMIT ?)", arrayOf(excess))
                put("dropped", ((get("dropped")?.toLongOrNull() ?: 0) + excess).toString())
            }
            writableDatabase.setTransactionSuccessful()
        } finally { writableDatabase.endTransaction() }
    }
    fun batch(limit: Int = 20, pendingOnly: Boolean = true): JSONArray {
        val acked = if (pendingOnly) get("acked")?.toLongOrNull() ?: 0L else 0L
        val out = JSONArray()
        readableDatabase.rawQuery("SELECT id,payload FROM records WHERE id>? ORDER BY id LIMIT ?", arrayOf(acked.toString(), limit.coerceIn(1, if (pendingOnly) 100 else 6000).toString())).use { c ->
            while (c.moveToNext()) out.put(JSONObject().put("id", c.getLong(0)).put("observation", JSONObject(String(JournalCipher.decrypt(c.getBlob(1)), Charsets.UTF_8))))
        }
        return out
    }
    fun summary(): JSONObject = JSONObject().put("interventions", get("interventions")?.let(::JSONArray) ?: JSONArray()).put("storedRecords", readableDatabase.rawQuery("SELECT COUNT(*) FROM records", null).use { it.moveToFirst(); it.getLong(0) }).put("run", get("run")?.let { JSONObject(it) } ?: JSONObject.NULL)
        .put("active", get("active") == "true").put("stopReason", get("stopReason") ?: JSONObject.NULL)
        .put("lastSampleWallMs", get("lastSampleWall")?.toLongOrNull() ?: JSONObject.NULL)
        .put("droppedRecords", get("dropped")?.toLongOrNull() ?: 0).put("ackedThroughId", get("acked")?.toLongOrNull() ?: 0)
        .put("assessment", "REVIEW_REQUIRED; elapsed72h is not acceptance; gaps/reboots/clock changes/interventions need review")
}
