package com.brick.safety.evidence

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.brick.safety.crypto.JournalCipher

interface EvidenceCipher {
    fun encrypt(plain: ByteArray): ByteArray
    fun decrypt(blob: ByteArray): ByteArray
}

object AndroidEvidenceCipher : EvidenceCipher {
    override fun encrypt(plain: ByteArray): ByteArray = JournalCipher.encrypt(plain)
    override fun decrypt(blob: ByteArray): ByteArray = JournalCipher.decrypt(blob)
}

class EvidenceJournal(
    context: Context,
    private val cipher: EvidenceCipher = AndroidEvidenceCipher
) : SQLiteOpenHelper(context, DATABASE_NAME, null, 1) {
    companion object {
        const val DATABASE_NAME = "brick_evidence.db"
        private const val FAILURE_HOLD_MS = 120_000L
    }

    private val healthPrefs = context.applicationContext.getSharedPreferences("brick", Context.MODE_PRIVATE)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE evidence(" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "record_id TEXT NOT NULL UNIQUE," +
                "epoch INTEGER NOT NULL," +
                "seq INTEGER NOT NULL," +
                "payload BLOB NOT NULL," +
                "created_ms INTEGER NOT NULL," +
                "acked INTEGER NOT NULL DEFAULT 0," +
                "UNIQUE(epoch,seq))"
        )
        db.execSQL("CREATE INDEX idx_evidence_pending ON evidence(acked,id)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    data class Pending(val id: Long, val record: EvidenceRecord)
    data class Stats(val pendingCount: Int, val oldestPendingMs: Long?, val quarantinedCount: Int)

    private fun hasQuarantinedEvidence(): Boolean = runCatching {
        readableDatabase.rawQuery("SELECT 1 FROM evidence WHERE acked=2 LIMIT 1", emptyArray()).use { it.moveToFirst() }
    }.getOrDefault(true)

    private fun noteHealthy(operationHealthy: Boolean) {
        val now = System.currentTimeMillis()
        val priorFailure = healthPrefs.getLong("lastEvidenceJournalFailureWallMs", 0L)
        val freshPriorFailure = priorFailure > 0L && now >= priorFailure && now - priorFailure < FAILURE_HOLD_MS
        val currentFailure = !operationHealthy || hasQuarantinedEvidence()
        val healthy = !currentFailure && !freshPriorFailure
        healthPrefs.edit().putBoolean("evidenceJournalHealthy", healthy).apply {
            if (currentFailure) putLong("lastEvidenceJournalFailureWallMs", now)
        }.apply()
    }

    private fun quarantine(rowId: Long) {
        runCatching {
            writableDatabase.update(
                "evidence",
                ContentValues().apply { put("acked", 2) },
                "id=? AND acked=0",
                arrayOf(rowId.toString())
            )
        }
        noteHealthy(false)
    }

    fun append(record: EvidenceRecord): Boolean {
        return try {
            val encoded = EvidenceProtocol.encodeRecord(record)
            val rowId = writableDatabase.insertWithOnConflict(
                "evidence",
                null,
                ContentValues().apply {
                    put("record_id", record.observation.recordId)
                    put("epoch", record.epoch)
                    put("seq", record.sequence)
                    put("payload", cipher.encrypt(encoded))
                    put("created_ms", System.currentTimeMillis())
                },
                SQLiteDatabase.CONFLICT_IGNORE
            )
            val ok = rowId != -1L
            noteHealthy(ok)
            ok
        } catch (_: Throwable) {
            noteHealthy(false)
            false
        }
    }

    fun maxSequence(epoch: Int): Long {
        readableDatabase.rawQuery(
            "SELECT COALESCE(MAX(seq),0) FROM evidence WHERE epoch=?",
            arrayOf(epoch.toString())
        ).use { c ->
            c.moveToFirst()
            return c.getLong(0)
        }
    }

    fun nextPending(limit: Int = EvidenceProtocol.MAX_RECORDS_PER_BATCH): List<Pending> {
        val safeLimit = limit.coerceIn(1, EvidenceProtocol.MAX_RECORDS_PER_BATCH)
        val out = mutableListOf<Pending>()
        readableDatabase.rawQuery(
            "SELECT id,record_id,epoch,seq,payload FROM evidence WHERE acked=0 ORDER BY id LIMIT ?",
            arrayOf((safeLimit + 16).toString())
        ).use { c ->
            while (c.moveToNext() && out.size < safeLimit) {
                val rowId = c.getLong(0)
                val storedRecordId = c.getString(1)
                val storedEpoch = c.getInt(2)
                val storedSeq = c.getLong(3)
                val record = try {
                    EvidenceProtocol.decodeRecord(cipher.decrypt(c.getBlob(4)))
                } catch (_: Throwable) {
                    quarantine(rowId)
                    continue
                }
                if (record.observation.recordId != storedRecordId || record.epoch != storedEpoch || record.sequence != storedSeq) {
                    quarantine(rowId)
                    continue
                }
                out += Pending(rowId, record)
            }
        }
        return out
    }

    fun stats(): Stats {
        readableDatabase.rawQuery(
            "SELECT SUM(CASE WHEN acked=0 THEN 1 ELSE 0 END)," +
                " MIN(CASE WHEN acked=0 THEN created_ms END)," +
                " SUM(CASE WHEN acked=2 THEN 1 ELSE 0 END) FROM evidence",
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

    fun ackBatch(items: List<EvidenceAck>): Boolean {
        if (items.isEmpty()) return true
        if (items.distinct().size != items.size) return false
        val db = writableDatabase
        return try {
            db.beginTransaction()
            for (ack in items) {
                val changed = db.update(
                    "evidence",
                    ContentValues().apply { put("acked", 1) },
                    "record_id=? AND epoch=? AND seq=? AND acked=0",
                    arrayOf(ack.recordId, ack.epoch.toString(), ack.sequence.toString())
                )
                if (changed != 1) throw IllegalStateException("exact evidence ACK did not match one pending row")
            }
            cleanupDelivered(db)
            db.setTransactionSuccessful()
            noteHealthy(true)
            true
        } catch (_: Throwable) {
            noteHealthy(false)
            false
        } finally {
            if (db.inTransaction()) db.endTransaction()
        }
    }

    private fun cleanupDelivered(db: SQLiteDatabase) {
        db.execSQL("DELETE FROM evidence WHERE acked=1 AND id < (SELECT COALESCE(MAX(id)-500,0) FROM evidence)")
    }
}
