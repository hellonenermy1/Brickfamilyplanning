package com.brick.safety.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.brick.safety.crypto.JournalCipher

class SafetyOutbox(
    context: Context,
    private val writeFaultInjector: ((operation: String) -> Unit)? = null
) : SQLiteOpenHelper(context, "brick_safety_outbox.db", null, 2) {
    companion object {
        private const val FAILURE_HOLD_MS = 120_000L
        private const val SOS_STATE_KEY = "sos_active"
        private const val HIGH_FALL_UNTIL_KEY = "high_fall_until_ms"
        const val UNKNOWN_PENDING_COUNT = Int.MAX_VALUE
    }

    private data class StateMutation(val name: String, val value: String)

    private val healthPrefs = context.applicationContext.getSharedPreferences("brick", Context.MODE_PRIVATE)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE safety_events(id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, payload BLOB NOT NULL, created_ms INTEGER NOT NULL, priority INTEGER NOT NULL DEFAULT 1, acked INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE INDEX idx_safety_pending ON safety_events(acked,priority,id)")
        createStateTable(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) createStateTable(db)
    }

    private fun createStateTable(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS safety_state(name TEXT PRIMARY KEY, value TEXT NOT NULL, updated_ms INTEGER NOT NULL)")
    }

    data class Pending(val rowId: Long, val eventId: String, val kind: String, val payload: ByteArray, val priority: Int)
    data class Stats(val pendingCount: Int, val oldestPendingMs: Long?, val quarantinedCount: Int)

    private fun hasQuarantinedEvidence(): Boolean = runCatching {
        readableDatabase.rawQuery("SELECT 1 FROM safety_events WHERE acked=2 LIMIT 1", emptyArray()).use { it.moveToFirst() }
    }.getOrDefault(true)

    private fun noteHealthy(operationHealthy: Boolean) {
        val now = System.currentTimeMillis()
        val quarantined = hasQuarantinedEvidence()
        val priorFailure = healthPrefs.getLong("lastSafetyOutboxWriteFailureWallMs", 0L)
        val freshPriorFailure = priorFailure > 0L && now >= priorFailure && now - priorFailure < FAILURE_HOLD_MS
        val currentFailure = !operationHealthy || quarantined
        val healthy = !currentFailure && !freshPriorFailure
        healthPrefs.edit().putBoolean("safetyOutboxWriteHealthy", healthy).apply {
            if (currentFailure) putLong("lastSafetyOutboxWriteFailureWallMs", now)
        }.apply()
    }

    private fun quarantine(rowId: Long) {
        runCatching {
            writableDatabase.update(
                "safety_events",
                ContentValues().apply { put("acked", 2) },
                "id=? AND acked=0",
                arrayOf(rowId.toString())
            )
        }
        noteHealthy(false)
    }

    fun append(eventId: String, kind: String, payload: ByteArray, priority: Int): Boolean =
        appendInternal(eventId, kind, payload, priority, "append", stateMutation = null)

    /** Persists the SOS event and authoritative SOS state in the same SQLite transaction. */
    fun appendSosTransition(
        eventId: String,
        kind: String,
        payload: ByteArray,
        priority: Int,
        active: Boolean
    ): Boolean = appendInternal(
        eventId,
        kind,
        payload,
        priority,
        "append_sos_transition",
        StateMutation(SOS_STATE_KEY, if (active) "1" else "0")
    )

    /** Persists a HIGH-fall event and its bounded protection deadline in one transaction. */
    fun appendHighFall(
        eventId: String,
        kind: String,
        payload: ByteArray,
        priority: Int,
        highUntilMs: Long
    ): Boolean {
        require(highUntilMs > 0L)
        return appendInternal(
            eventId,
            kind,
            payload,
            priority,
            "append_high_fall",
            StateMutation(HIGH_FALL_UNTIL_KEY, highUntilMs.toString())
        )
    }

    private fun appendInternal(
        eventId: String,
        kind: String,
        payload: ByteArray,
        priority: Int,
        operation: String,
        stateMutation: StateMutation?
    ): Boolean {
        return try {
            writeFaultInjector?.invoke(operation)
            val db = writableDatabase
            db.beginTransaction()
            val saved = try {
                val rowId = db.insertWithOnConflict("safety_events", null, ContentValues().apply {
                    put("event_id", eventId)
                    put("kind", kind)
                    put("payload", JournalCipher.encrypt(payload))
                    put("created_ms", System.currentTimeMillis())
                    put("priority", priority)
                }, SQLiteDatabase.CONFLICT_IGNORE)
                val durableEvent = rowId != -1L || containsEvent(db, eventId)
                if (!durableEvent) {
                    false
                } else if (stateMutation != null) {
                    val stateRow = db.insertWithOnConflict("safety_state", null, ContentValues().apply {
                        put("name", stateMutation.name)
                        put("value", stateMutation.value)
                        put("updated_ms", System.currentTimeMillis())
                    }, SQLiteDatabase.CONFLICT_REPLACE)
                    if (stateRow == -1L) {
                        false
                    } else {
                        db.setTransactionSuccessful()
                        true
                    }
                } else {
                    db.setTransactionSuccessful()
                    true
                }
            } finally {
                db.endTransaction()
            }
            noteHealthy(saved)
            saved
        } catch (_: Throwable) {
            noteHealthy(false)
            false
        }
    }

    private fun containsEvent(eventId: String): Boolean = containsEvent(readableDatabase, eventId)

    private fun containsEvent(db: SQLiteDatabase, eventId: String): Boolean {
        db.rawQuery("SELECT 1 FROM safety_events WHERE event_id=? LIMIT 1", arrayOf(eventId)).use {
            return it.moveToFirst()
        }
    }

    /**
     * Returns the durable SOS mode. For an upgraded install with no state row yet, migrate the legacy
     * preference once so an already-active SOS is not lost during rollout.
     */
    fun sosActive(legacyFallback: Boolean): Boolean = try {
        readState(SOS_STATE_KEY)?.let { return it == "1" }
        if (!insertStateIfAbsent(SOS_STATE_KEY, if (legacyFallback) "1" else "0")) {
            noteHealthy(false)
        }
        legacyFallback
    } catch (_: Throwable) {
        noteHealthy(false)
        legacyFallback
    }

    /**
     * Returns the durable HIGH-fall protection deadline. Existing upgraded installs may migrate the
     * old preference once; expired values remain harmless and evaluate false at the caller.
     */
    fun highFallUntilMs(legacyFallback: Long): Long = try {
        readState(HIGH_FALL_UNTIL_KEY)?.toLongOrNull()?.coerceAtLeast(0L)?.let { return it }
        val fallback = legacyFallback.coerceAtLeast(0L)
        if (!insertStateIfAbsent(HIGH_FALL_UNTIL_KEY, fallback.toString())) {
            noteHealthy(false)
        }
        fallback
    } catch (_: Throwable) {
        noteHealthy(false)
        legacyFallback.coerceAtLeast(0L)
    }

    private fun readState(name: String): String? =
        readableDatabase.rawQuery("SELECT value FROM safety_state WHERE name=? LIMIT 1", arrayOf(name)).use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }

    private fun insertStateIfAbsent(name: String, value: String): Boolean {
        val db = writableDatabase
        db.beginTransaction()
        return try {
            val row = db.insertWithOnConflict("safety_state", null, ContentValues().apply {
                put("name", name)
                put("value", value)
                put("updated_ms", System.currentTimeMillis())
            }, SQLiteDatabase.CONFLICT_IGNORE)
            val ok = row != -1L || readStateExists(db, name)
            if (ok) db.setTransactionSuccessful()
            ok
        } finally {
            db.endTransaction()
        }
    }

    private fun readStateExists(db: SQLiteDatabase, name: String): Boolean =
        db.rawQuery("SELECT 1 FROM safety_state WHERE name=? LIMIT 1", arrayOf(name)).use { it.moveToFirst() }

    fun pending(
        limit: Int = 50,
        minPriority: Int = Int.MIN_VALUE,
        maxPriority: Int = Int.MAX_VALUE
    ): List<Pending> {
        val safeLimit = limit.coerceIn(1, 1_000)
        val out = mutableListOf<Pending>()
        return try {
            readableDatabase.rawQuery(
                "SELECT id,event_id,kind,payload,priority FROM safety_events WHERE acked=0 AND priority>=? AND priority<=? ORDER BY priority DESC,id ASC LIMIT ?",
                arrayOf(minPriority.toString(), maxPriority.toString(), (safeLimit + 32).toString())
            ).use { c ->
                while (c.moveToNext() && out.size < safeLimit) {
                    val rowId = c.getLong(0)
                    val payload = try {
                        JournalCipher.decrypt(c.getBlob(3))
                    } catch (_: Throwable) {
                        quarantine(rowId)
                        continue
                    }
                    out += Pending(rowId, c.getString(1), c.getString(2), payload, c.getInt(4))
                }
            }
            out
        } catch (_: Throwable) {
            noteHealthy(false)
            emptyList()
        }
    }

    fun pendingCountAtLeast(minPriority: Int): Int = try {
        readableDatabase.rawQuery(
            "SELECT COUNT(*) FROM safety_events WHERE acked=0 AND priority>=?",
            arrayOf(minPriority.toString())
        ).use { c -> if (c.moveToFirst()) c.getInt(0) else UNKNOWN_PENDING_COUNT }
    } catch (_: Throwable) {
        noteHealthy(false)
        UNKNOWN_PENDING_COUNT
    }

    fun ack(eventId: String): Boolean {
        return try {
            writeFaultInjector?.invoke("ack")
            val db = writableDatabase
            val changed = db.update(
                "safety_events",
                ContentValues().apply { put("acked", 1) },
                "event_id=? AND acked=0",
                arrayOf(eventId)
            )
            if (changed != 1) {
                false
            } else {
                db.execSQL("DELETE FROM safety_events WHERE acked=1 AND id < (SELECT COALESCE(MAX(id)-200,0) FROM safety_events)")
                noteHealthy(true)
                true
            }
        } catch (_: Throwable) {
            noteHealthy(false)
            false
        }
    }

    fun stats(): Stats = try {
        readableDatabase.rawQuery(
            "SELECT SUM(CASE WHEN acked=0 THEN 1 ELSE 0 END),MIN(CASE WHEN acked=0 THEN created_ms END),SUM(CASE WHEN acked=2 THEN 1 ELSE 0 END) FROM safety_events",
            emptyArray()
        ).use { c ->
            c.moveToFirst()
            Stats(
                if (c.isNull(0)) 0 else c.getInt(0),
                if (c.isNull(1)) null else c.getLong(1),
                if (c.isNull(2)) 0 else c.getInt(2)
            )
        }
    } catch (_: Throwable) {
        noteHealthy(false)
        Stats(UNKNOWN_PENDING_COUNT, null, 0)
    }
}
