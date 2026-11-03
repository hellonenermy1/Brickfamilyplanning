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
        const val UNKNOWN_PENDING_COUNT = Int.MAX_VALUE
    }

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
        appendInternal(eventId, kind, payload, priority, sosActive = null)

    /**
     * Persists the SOS event and the authoritative local SOS active/inactive state in one SQLite
     * transaction. SharedPreferences is only a compatibility mirror and is never the durability
     * boundary for SOS mode.
     */
    fun appendSosTransition(
        eventId: String,
        kind: String,
        payload: ByteArray,
        priority: Int,
        active: Boolean
    ): Boolean = appendInternal(eventId, kind, payload, priority, sosActive = active)

    private fun appendInternal(
        eventId: String,
        kind: String,
        payload: ByteArray,
        priority: Int,
        sosActive: Boolean?
    ): Boolean {
        return try {
            writeFaultInjector?.invoke(if (sosActive == null) "append" else "append_sos_transition")
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
                } else if (sosActive != null) {
                    val stateRow = db.insertWithOnConflict("safety_state", null, ContentValues().apply {
                        put("name", SOS_STATE_KEY)
                        put("value", if (sosActive) "1" else "0")
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
        readableDatabase.rawQuery("SELECT value FROM safety_state WHERE name=? LIMIT 1", arrayOf(SOS_STATE_KEY)).use { c ->
            if (c.moveToFirst()) return c.getString(0) == "1"
        }
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.insertWithOnConflict("safety_state", null, ContentValues().apply {
                put("name", SOS_STATE_KEY)
                put("value", if (legacyFallback) "1" else "0")
                put("updated_ms", System.currentTimeMillis())
            }, SQLiteDatabase.CONFLICT_IGNORE)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        legacyFallback
    } catch (_: Throwable) {
        noteHealthy(false)
        legacyFallback
    }

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
