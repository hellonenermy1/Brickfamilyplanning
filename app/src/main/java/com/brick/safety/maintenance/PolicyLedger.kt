package com.brick.safety.maintenance

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Durable provenance for system/policy changes Brick deliberately makes.
 *
 * The ledger stores only small policy/state metadata, never coordinates, radio identifiers, secrets,
 * or arbitrary shell commands. Active provenance is never evicted; only reverted history may be
 * compacted. A caller must not apply a new Brick policy when record() returns null.
 */
object PolicyLedger {
    private const val PREFS = "brick_policy_ledger_v1"
    private const val KEY_RECORDS = "records"
    private const val MAX_RECORDS = 256

    data class Entry(
        val id: String,
        val policy: String,
        val previousValue: String?,
        val brickValue: String?,
        val appliedAtMs: Long,
        val source: String,
        val revertedAtMs: Long?
    ) {
        val active: Boolean get() = revertedAtMs == null
    }

    @Synchronized
    fun record(
        context: Context,
        policy: String,
        previousValue: String?,
        brickValue: String?,
        source: String
    ): String? {
        require(policy.matches(Regex("[A-Za-z0-9._:-]{1,120}")))
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_RECORDS, null)
        if (!isValidRaw(raw)) return null
        val array = readArray(raw)
        val now = System.currentTimeMillis()

        // Do not create duplicate active provenance for the same effective Brick state.
        for (i in array.length() - 1 downTo 0) {
            val item = array.optJSONObject(i) ?: return null
            if (item.optString("policy") == policy && item.isNull("revertedAtMs") &&
                item.optString("brickValue", null) == brickValue) {
                return item.optString("id").takeIf { it.isNotBlank() }
            }
        }

        // Make room only by dropping the oldest reverted history. Active provenance is never evicted.
        while (array.length() >= MAX_RECORDS) {
            var revertedIndex = -1
            for (i in 0 until array.length()) {
                val item = array.optJSONObject(i) ?: return null
                if (!item.isNull("revertedAtMs")) {
                    revertedIndex = i
                    break
                }
            }
            if (revertedIndex < 0) return null
            array.remove(revertedIndex)
        }

        val id = UUID.randomUUID().toString()
        val entry = JSONObject()
            .put("id", id)
            .put("policy", policy)
            .put("previousValue", previousValue ?: JSONObject.NULL)
            .put("brickValue", brickValue ?: JSONObject.NULL)
            .put("appliedAtMs", now)
            .put("source", source.take(80))
            .put("revertedAtMs", JSONObject.NULL)
        array.put(entry)
        return if (prefs.edit().putString(KEY_RECORDS, array.toString()).commit()) id else null
    }

    @Synchronized
    fun integrityValid(context: Context): Boolean {
        val raw = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_RECORDS, null)
        return isValidRaw(raw)
    }

    @Synchronized
    fun active(context: Context): List<Entry> = read(context).filter { it.active }

    @Synchronized
    fun read(context: Context): List<Entry> {
        val raw = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_RECORDS, null)
        if (!isValidRaw(raw)) return emptyList()
        val array = readArray(raw)
        return buildList {
            for (i in 0 until array.length()) {
                val o = array.getJSONObject(i)
                add(
                    Entry(
                        id = o.getString("id"),
                        policy = o.getString("policy"),
                        previousValue = if (o.isNull("previousValue")) null else o.getString("previousValue"),
                        brickValue = if (o.isNull("brickValue")) null else o.getString("brickValue"),
                        appliedAtMs = o.getLong("appliedAtMs"),
                        source = o.optString("source").take(80),
                        revertedAtMs = if (o.isNull("revertedAtMs")) null else o.getLong("revertedAtMs").takeIf { it > 0L }
                    )
                )
            }
        }
    }

    @Synchronized
    fun markReverted(context: Context, id: String): Boolean {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_RECORDS, null)
        if (!isValidRaw(raw)) return false
        val array = readArray(raw)
        var found = false
        val now = System.currentTimeMillis()
        for (i in 0 until array.length()) {
            val item = array.getJSONObject(i)
            if (item.getString("id") == id && item.isNull("revertedAtMs")) {
                item.put("revertedAtMs", now)
                found = true
                break
            }
        }
        return !found || prefs.edit().putString(KEY_RECORDS, array.toString()).commit()
    }

    @Synchronized
    fun clear(context: Context): Boolean =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit()

    private fun isValidRaw(raw: String?): Boolean {
        if (raw.isNullOrBlank()) return true
        return runCatching {
            val array = JSONArray(raw)
            if (array.length() > MAX_RECORDS) return@runCatching false
            val ids = HashSet<String>()
            for (i in 0 until array.length()) {
                val o = array.optJSONObject(i) ?: return@runCatching false
                val id = o.optString("id")
                val policy = o.optString("policy")
                val appliedAt = o.optLong("appliedAtMs", -1L)
                if (id.isBlank() || !ids.add(id) || !policy.matches(Regex("[A-Za-z0-9._:-]{1,120}")) || appliedAt <= 0L) {
                    return@runCatching false
                }
                if (!o.has("revertedAtMs") || !o.has("previousValue") || !o.has("brickValue")) return@runCatching false
                if (!o.isNull("revertedAtMs") && o.optLong("revertedAtMs", -1L) <= 0L) return@runCatching false
            }
            true
        }.getOrDefault(false)
    }

    private fun readArray(raw: String?): JSONArray = if (raw.isNullOrBlank()) JSONArray() else JSONArray(raw)
}
