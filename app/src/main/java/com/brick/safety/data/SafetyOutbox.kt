package com.brick.safety.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.brick.safety.crypto.JournalCipher

/**
 * Durable safety-event outbox. [writeFaultInjector] is a deterministic instrumentation hook for
 * storage exceptions such as SQLITE_FULL; normal production callers leave it null.
 */
class SafetyOutbox(
    context: Context,
    private val writeFaultInjector: ((operation: String) -> Unit)? = null
) : SQLiteOpenHelper(context, "brick_safety_outbox.db", null, 1) {
    companion object {
        private const val FAILURE_HOLD_MS = 120_000L
        // Unknown safety state must block lower-priority history work rather than be mistaken for empty.
        const val UNKNOWN_PENDING_COUNT = Int.MAX_VALUE
    }
    private val healthPrefs = context.applicationContext.getSharedPreferences("brick", Context.MODE_PRIVATE)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE safety_events(id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, payload BLOB NOT NULL, created_ms INTEGER NOT NULL, priority INTEGER NOT NULL DEFAULT 1, acked INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE INDEX idx_safety_pending ON safety_events(acked,priority,id)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

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
        healthPrefs.edit()
            .putBoolean("safetyOutboxWriteHealthy", healthy)
            .apply {
                if (currentFailure) putLong("lastSafetyOutboxWriteFailureWallMs", now)
            }
            .apply()
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
        // Quarantined encrypted safety evidence stays on-device and is never cleaned up as delivered.
        // Later valid SOS/check-in events can continue to drain instead of being poisoned by one row.
        noteHealthy(false)
    }

    fun append(eventId: String, kind: String, payload: ByteArray, priority: Int): Boolean {
        return try {
            writeFaultInjector?.invoke("append")
            val rowId = writableDatabase.insertWithOnConflict("safety_events", null, ContentValues().apply {
                put("event_id", eventId)
                put("kind", kind)
                put("payload", JournalCipher.encrypt(payload))
                put("created_ms", System.currentTimeMillis())
                put("priority", priority)
            }, SQLiteDatabase.CONFLICT_IGNORE)
            val durable = rowId != -1L || containsEvent(eventId)
            noteHealthy(durable)
            durable
        } catch (_: Throwable) {
            noteHealthy(false)
            false
        }
    }

    private fun containsEvent(eventId: String): Boolean {
        readableDatabase.rawQuery(
            "SELECT 1 FROM safety_events WHERE event_id=? LIMIT 1",
            arrayOf(eventId)
        ).use { return it.moveToFirst() }
    }

    fun pending(limit: Int = 50): List<Pending> {
        val safeLimit = limit.coerceIn(1, 1_000)
        val out = mutableListOf<Pending>()
        return try {
            readableDatabase.rawQuery(
                "SELECT id,event_id,kind,payload,priority FROM safety_events WHERE acked=0 ORDER BY priority DESC,id ASC LIMIT ?",
                arrayOf((safeLimit + 32).toString())
            ).use { c ->
                while (c.moveToNext() && out.size < safeLimit) {
                    val rowId = c.getLong(0)
                    val payload = try { JournalCipher.decrypt(c.getBlob(3)) } catch (_: Throwable) {
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
            if (changed != 1) return false
            db.execSQL("DELETE FROM safety_events WHERE acked=1 AND id < (SELECT COALESCE(MAX(id)-200,0) FROM safety_events)")
            noteHealthy(true)
            true
        } catch (_: Throwable) {
            noteHealthy(false)
            false
        }
    }

    fun stats(): Stats {
        return try {
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
}
