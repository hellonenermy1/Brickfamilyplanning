package com.brick.safety.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.brick.safety.crypto.JournalCipher

class Journal(context: Context) : SQLiteOpenHelper(context, "brick_journal.db", null, 1) {
    companion object { private const val FAILURE_HOLD_MS = 120_000L }
    private val healthPrefs = context.applicationContext.getSharedPreferences("brick", Context.MODE_PRIVATE)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE packets(id INTEGER PRIMARY KEY AUTOINCREMENT, epoch INTEGER NOT NULL, seq INTEGER NOT NULL, payload BLOB NOT NULL, created_ms INTEGER NOT NULL, acked INTEGER NOT NULL DEFAULT 0, UNIQUE(epoch,seq))")
        db.execSQL("CREATE INDEX idx_packets_pending ON packets(acked,id)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    private fun hasQuarantinedEvidence(): Boolean = runCatching {
        readableDatabase.rawQuery("SELECT 1 FROM packets WHERE acked=2 LIMIT 1", emptyArray()).use { it.moveToFirst() }
    }.getOrDefault(true)

    private fun noteJournalHealthy(operationHealthy: Boolean) {
        val now = System.currentTimeMillis()
        val quarantined = hasQuarantinedEvidence()
        val priorFailure = healthPrefs.getLong("lastJournalWriteFailureWallMs", 0L)
        val freshPriorFailure = priorFailure > 0L && now >= priorFailure && now - priorFailure < FAILURE_HOLD_MS
        val currentFailure = !operationHealthy || quarantined
        val healthy = !currentFailure && !freshPriorFailure
        healthPrefs.edit()
            .putBoolean("journalWriteHealthy", healthy)
            .apply {
                if (currentFailure) putLong("lastJournalWriteFailureWallMs", now)
            }
            .apply()
    }

    private fun quarantine(rowId: Long) {
        runCatching {
            writableDatabase.update(
                "packets",
                ContentValues().apply { put("acked", 2) },
                "id=? AND acked=0",
                arrayOf(rowId.toString())
            )
        }
        // acked=2 is deliberately never deleted by delivered-row cleanup. The encrypted evidence is
        // preserved locally, but it no longer blocks later valid backlog records from uploading.
        noteJournalHealthy(false)
    }

    fun append(epoch: Int, seq: Long, payload: ByteArray): Boolean {
        return try {
            val rowId = writableDatabase.insertWithOnConflict("packets", null, ContentValues().apply {
                put("epoch", epoch)
                put("seq", seq)
                put("payload", JournalCipher.encrypt(payload))
                put("created_ms", System.currentTimeMillis())
            }, SQLiteDatabase.CONFLICT_IGNORE)
            val ok = rowId != -1L
            noteJournalHealthy(ok)
            ok
        } catch (_: Throwable) {
            noteJournalHealthy(false)
            false
        }
    }

    fun maxSequence(epoch: Int): Long {
        readableDatabase.rawQuery(
            "SELECT COALESCE(MAX(seq),0) FROM packets WHERE epoch=?",
            arrayOf(epoch.toString())
        ).use { c ->
            c.moveToFirst()
            return c.getLong(0)
        }
    }

    data class Pending(val id: Long, val epoch: Int, val seq: Long, val payload: ByteArray)
    data class Stats(val pendingCount: Int, val oldestPendingMs: Long?, val quarantinedCount: Int)

    fun latestPending(): Pending? {
        readableDatabase.rawQuery(
            "SELECT id,epoch,seq,payload FROM packets WHERE acked=0 ORDER BY id DESC LIMIT 32",
            emptyArray()
        ).use { c ->
            while (c.moveToNext()) {
                val rowId = c.getLong(0)
                val payload = try { JournalCipher.decrypt(c.getBlob(3)) } catch (_: Throwable) {
                    quarantine(rowId)
                    continue
                }
                return Pending(rowId, c.getInt(1), c.getLong(2), payload)
            }
        }
        return null
    }

    fun nextPending(limit: Int = 100): List<Pending> {
        val safeLimit = limit.coerceIn(1, 1_000)
        val out = mutableListOf<Pending>()
        readableDatabase.rawQuery(
            "SELECT id,epoch,seq,payload FROM packets WHERE acked=0 ORDER BY id LIMIT ?",
            arrayOf((safeLimit + 32).toString())
        ).use { c ->
            while (c.moveToNext() && out.size < safeLimit) {
                val rowId = c.getLong(0)
                val payload = try { JournalCipher.decrypt(c.getBlob(3)) } catch (_: Throwable) {
                    quarantine(rowId)
                    continue
                }
                out += Pending(rowId, c.getInt(1), c.getLong(2), payload)
            }
        }
        return out
    }

    fun stats(): Stats {
        readableDatabase.rawQuery(
            "SELECT SUM(CASE WHEN acked=0 THEN 1 ELSE 0 END), MIN(CASE WHEN acked=0 THEN created_ms END), SUM(CASE WHEN acked=2 THEN 1 ELSE 0 END) FROM packets",
            emptyArray()
        ).use { c ->
            c.moveToFirst()
            return Stats(
                if (c.isNull(0)) 0 else c.getInt(0),
                if (c.isNull(1)) null else c.getLong(1),
                if (c.isNull(2)) 0 else c.getInt(2)
            )
        }
    }

    private fun cleanupDelivered(db: SQLiteDatabase) {
        db.execSQL("DELETE FROM packets WHERE acked=1 AND id < (SELECT COALESCE(MAX(id)-500,0) FROM packets)")
    }

    fun ackExact(epoch: Int, seq: Long): Boolean = ackBatch(listOf(epoch to seq))

    fun ackBatch(items: List<Pair<Int, Long>>): Boolean {
        if (items.isEmpty()) return true
        val unique = items.distinct()
        if (unique.size != items.size) return false
        val db = writableDatabase
        return try {
            db.beginTransaction()
            for ((epoch, seq) in items) {
                val changed = db.update(
                    "packets",
                    ContentValues().apply { put("acked", 1) },
                    "epoch=? AND seq=? AND acked=0",
                    arrayOf(epoch.toString(), seq.toString())
                )
                if (changed != 1) throw IllegalStateException("exact ACK did not match one pending row")
            }
            cleanupDelivered(db)
            db.setTransactionSuccessful()
            noteJournalHealthy(true)
            true
        } catch (_: Throwable) {
            noteJournalHealthy(false)
            false
        } finally {
            if (db.inTransaction()) db.endTransaction()
        }
    }
}
