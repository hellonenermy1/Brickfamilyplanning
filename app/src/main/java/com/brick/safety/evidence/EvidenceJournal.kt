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
) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {
    companion object {
        const val DATABASE_NAME = "brick_evidence.db"
        private const val DATABASE_VERSION = 3
        private const val FAILURE_HOLD_MS = 120_000L
        private const val QUARANTINE_RETENTION_MS = 30L * 24L * 60L * 60L * 1_000L
        private const val QUARANTINE_CLEANUP_INTERVAL_MS = 6L * 60L * 60L * 1_000L
        private const val QUARANTINE_MAX_ROWS = 2_048
        private const val PREF_LAST_QUARANTINE_CLEANUP = "lastEvidenceQuarantineCleanupWallMs"
        private const val PREF_QUARANTINE_PURGED_TOTAL = "evidenceQuarantinePurgedRecordsTotal"
        private val DEVICE_ID_RE = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
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
        db.execSQL("CREATE TABLE evidence_sequence(epoch INTEGER PRIMARY KEY,next_seq INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE evidence_owner(singleton INTEGER PRIMARY KEY CHECK(singleton=1),device_id TEXT NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            db.execSQL("CREATE TABLE IF NOT EXISTS evidence_sequence(epoch INTEGER PRIMARY KEY,next_seq INTEGER NOT NULL)")
            db.execSQL(
                "INSERT OR REPLACE INTO evidence_sequence(epoch,next_seq) " +
                    "SELECT epoch,COALESCE(MAX(seq),0)+1 FROM evidence GROUP BY epoch"
            )
        }
        if (oldVersion < 3) {
            // Phase 2 staging was not promoted to production before this migration. Existing test/dev
            // rows therefore bind lazily to the first valid paired identity that uses the upgraded DB.
            db.execSQL("CREATE TABLE IF NOT EXISTS evidence_owner(singleton INTEGER PRIMARY KEY CHECK(singleton=1),device_id TEXT NOT NULL)")
        }
    }

    data class Pending(val id: Long, val record: EvidenceRecord)
    data class Stats(val pendingCount: Int, val oldestPendingMs: Long?, val quarantinedCount: Int)
    data class OwnerBinding(val changed: Boolean, val quarantinedPending: Int)

    private fun noteHealthy(operationHealthy: Boolean) {
        val now = System.currentTimeMillis()
        val priorFailure = healthPrefs.getLong("lastEvidenceJournalFailureWallMs", 0L)
        val freshPriorFailure = priorFailure > 0L && (now < priorFailure || now - priorFailure < FAILURE_HOLD_MS)
        val healthy = operationHealthy && !freshPriorFailure
        healthPrefs.edit().putBoolean("evidenceJournalHealthy", healthy).apply {
            if (!operationHealthy) putLong("lastEvidenceJournalFailureWallMs", now)
        }.apply()
    }

    private fun addCount(key: String, delta: Int): Long {
        val previous = healthPrefs.getLong(key, 0L).coerceAtLeast(0L)
        val added = delta.toLong().coerceAtLeast(0L)
        return if (Long.MAX_VALUE - previous < added) Long.MAX_VALUE else previous + added
    }

    /**
     * Quarantine is diagnostic retention, not an infinite second backlog. Permanent server
     * conflicts, corrupt rows and a re-pair can otherwise accumulate forever even though those rows
     * can no longer be delivered. Keep a generous 30-day window plus a hard 2,048-row ceiling and
     * preserve lifetime counters in health preferences when old quarantine is automatically purged.
     */
    private fun maybeCleanupQuarantine(force: Boolean = false): Int {
        val now = System.currentTimeMillis()
        val last = healthPrefs.getLong(PREF_LAST_QUARANTINE_CLEANUP, 0L)
        if (!force && last > 0L && now >= last && now - last < QUARANTINE_CLEANUP_INTERVAL_MS) return 0

        val db = writableDatabase
        var purged = 0
        var healthy = false
        try {
            db.beginTransaction()
            val cutoff = (now - QUARANTINE_RETENTION_MS).coerceAtLeast(0L)
            purged += db.delete("evidence", "acked=2 AND created_ms<?", arrayOf(cutoff.toString()))

            val quarantined = db.rawQuery("SELECT COUNT(*) FROM evidence WHERE acked=2", emptyArray()).use { c ->
                check(c.moveToFirst()) { "quarantine count returned no row" }
                c.getInt(0)
            }
            val overflow = (quarantined - QUARANTINE_MAX_ROWS).coerceAtLeast(0)
            if (overflow > 0) {
                db.execSQL(
                    "DELETE FROM evidence WHERE id IN (" +
                        "SELECT id FROM evidence WHERE acked=2 ORDER BY created_ms,id LIMIT ?)",
                    arrayOf(overflow)
                )
                purged += db.rawQuery("SELECT changes()", emptyArray()).use { c ->
                    check(c.moveToFirst()) { "quarantine cleanup changes returned no row" }
                    c.getInt(0)
                }
            }
            db.setTransactionSuccessful()
            healthy = true
        } catch (_: Throwable) {
            healthy = false
        } finally {
            if (db.inTransaction()) db.endTransaction()
        }

        if (healthy) {
            val edit = healthPrefs.edit().putLong(PREF_LAST_QUARANTINE_CLEANUP, now)
            if (purged > 0) {
                edit.putLong(PREF_QUARANTINE_PURGED_TOTAL, addCount(PREF_QUARANTINE_PURGED_TOTAL, purged))
            }
            edit.apply()
        } else {
            noteHealthy(false)
        }
        return if (healthy) purged else 0
    }

    private fun noteIdentityChange(binding: OwnerBinding) {
        if (!binding.changed) return
        healthPrefs.edit()
            .putLong("lastEvidenceIdentityChangeWallMs", System.currentTimeMillis())
            .putLong(
                "evidenceIdentityQuarantinedRecordsTotal",
                addCount("evidenceIdentityQuarantinedRecordsTotal", binding.quarantinedPending)
            )
            .apply()
    }

    private fun noteServerConflict(count: Int) {
        healthPrefs.edit()
            .putLong("lastEvidenceServerConflictWallMs", System.currentTimeMillis())
            .putLong(
                "evidenceServerConflictRecordsTotal",
                addCount("evidenceServerConflictRecordsTotal", count)
            )
            .apply()
    }

    private fun bindOwnerInTransaction(db: SQLiteDatabase, deviceId: String): OwnerBinding {
        val existing = db.rawQuery(
            "SELECT device_id FROM evidence_owner WHERE singleton=1",
            emptyArray()
        ).use { c -> if (c.moveToFirst()) c.getString(0) else null }

        if (existing == null) {
            db.insertOrThrow(
                "evidence_owner",
                null,
                ContentValues().apply {
                    put("singleton", 1)
                    put("device_id", deviceId)
                }
            )
            return OwnerBinding(changed = false, quarantinedPending = 0)
        }
        if (existing == deviceId) return OwnerBinding(changed = false, quarantinedPending = 0)

        val quarantined = db.update(
            "evidence",
            ContentValues().apply { put("acked", 2) },
            "acked=0",
            null
        )
        val changed = db.update(
            "evidence_owner",
            ContentValues().apply { put("device_id", deviceId) },
            "singleton=1",
            null
        )
        check(changed == 1) { "evidence owner rebind failed" }
        return OwnerBinding(changed = true, quarantinedPending = quarantined)
    }

    fun ensureDeviceOwner(deviceId: String): OwnerBinding? {
        if (!DEVICE_ID_RE.matches(deviceId)) return null
        val db = writableDatabase
        var binding: OwnerBinding? = null
        var healthy = false
        try {
            db.beginTransaction()
            binding = bindOwnerInTransaction(db, deviceId)
            db.setTransactionSuccessful()
            healthy = true
        } catch (_: Throwable) {
            binding = null
        } finally {
            if (db.inTransaction()) db.endTransaction()
            noteHealthy(healthy)
        }
        if (healthy) {
            binding?.let(::noteIdentityChange)
            maybeCleanupQuarantine()
        }
        return binding
    }

    fun refreshHealth(): Boolean {
        maybeCleanupQuarantine()
        val readable = runCatching {
            readableDatabase.rawQuery("SELECT COUNT(*) FROM evidence", emptyArray()).use { cursor ->
                check(cursor.moveToFirst()) { "evidence health probe returned no row" }
                cursor.getLong(0)
            }
        }.isSuccess
        noteHealthy(readable)
        return healthPrefs.getBoolean("evidenceJournalHealthy", false)
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

    fun appendNew(deviceId: String, epoch: Int, observation: EvidenceObservation): EvidenceRecord? {
        if (!DEVICE_ID_RE.matches(deviceId)) return null
        require(epoch >= 0)
        val db = writableDatabase
        var record: EvidenceRecord? = null
        var binding: OwnerBinding? = null
        var healthy = false
        try {
            db.beginTransaction()
            binding = bindOwnerInTransaction(db, deviceId)
            db.execSQL(
                "INSERT OR IGNORE INTO evidence_sequence(epoch,next_seq) VALUES(?,COALESCE((SELECT MAX(seq)+1 FROM evidence WHERE epoch=?),1))",
                arrayOf(epoch, epoch)
            )
            val next = db.rawQuery(
                "SELECT next_seq FROM evidence_sequence WHERE epoch=?",
                arrayOf(epoch.toString())
            ).use { c ->
                check(c.moveToFirst()) { "evidence sequence state missing" }
                c.getLong(0)
            }
            check(next > 0L && next <= EvidenceProtocol.MAX_WIRE_INTEGER) { "evidence sequence exhausted" }
            val candidate = EvidenceRecord(epoch, next, observation)
            val encoded = EvidenceProtocol.encodeRecord(candidate)
            val rowId = db.insertOrThrow(
                "evidence",
                null,
                ContentValues().apply {
                    put("record_id", candidate.observation.recordId)
                    put("epoch", candidate.epoch)
                    put("seq", candidate.sequence)
                    put("payload", cipher.encrypt(encoded))
                    put("created_ms", System.currentTimeMillis())
                }
            )
            check(rowId != -1L)
            check(next < EvidenceProtocol.MAX_WIRE_INTEGER) { "evidence sequence exhausted" }
            db.execSQL("UPDATE evidence_sequence SET next_seq=? WHERE epoch=?", arrayOf(next + 1L, epoch))
            db.setTransactionSuccessful()
            record = candidate
            healthy = true
        } catch (_: Throwable) {
            record = null
        } finally {
            if (db.inTransaction()) db.endTransaction()
            noteHealthy(healthy)
        }
        if (healthy) {
            binding?.let(::noteIdentityChange)
            maybeCleanupQuarantine()
        }
        return record
    }

    /** Exact-record insertion is retained for deterministic tests/import/recovery tooling. */
    fun append(record: EvidenceRecord): Boolean {
        val db = writableDatabase
        var healthy = false
        try {
            db.beginTransaction()
            val encoded = EvidenceProtocol.encodeRecord(record)
            val rowId = db.insertWithOnConflict(
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
            check(rowId != -1L) { "duplicate evidence record" }
            check(record.sequence < EvidenceProtocol.MAX_WIRE_INTEGER) { "evidence sequence exhausted" }
            db.execSQL(
                "INSERT OR IGNORE INTO evidence_sequence(epoch,next_seq) VALUES(?,?)",
                arrayOf(record.epoch, record.sequence + 1L)
            )
            db.execSQL(
                "UPDATE evidence_sequence SET next_seq=? WHERE epoch=? AND next_seq<?",
                arrayOf(record.sequence + 1L, record.epoch, record.sequence + 1L)
            )
            db.setTransactionSuccessful()
            healthy = true
        } catch (_: Throwable) {
            healthy = false
        } finally {
            if (db.inTransaction()) db.endTransaction()
            noteHealthy(healthy)
        }
        if (healthy) maybeCleanupQuarantine()
        return healthy
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
            "SELECT id,record_id,epoch,seq,payload FROM evidence WHERE acked=0 ORDER BY epoch,seq,id LIMIT ?",
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
        var healthy = false
        try {
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
            healthy = true
        } catch (_: Throwable) {
            healthy = false
        } finally {
            if (db.inTransaction()) db.endTransaction()
            noteHealthy(healthy)
        }
        if (healthy) maybeCleanupQuarantine()
        return healthy
    }

    /**
     * Preserve a server-rejected durable identity locally without letting it block all later
     * evidence forever. This is not deletion and not an ACK: exact pending rows move to quarantine.
     */
    fun quarantineConflictBatch(items: List<EvidenceAck>): Boolean {
        if (items.isEmpty() || items.distinct().size != items.size) return false
        val db = writableDatabase
        var healthy = false
        try {
            db.beginTransaction()
            for (item in items) {
                val changed = db.update(
                    "evidence",
                    ContentValues().apply { put("acked", 2) },
                    "record_id=? AND epoch=? AND seq=? AND acked=0",
                    arrayOf(item.recordId, item.epoch.toString(), item.sequence.toString())
                )
                if (changed != 1) throw IllegalStateException("conflict quarantine did not match one pending row")
            }
            db.setTransactionSuccessful()
            healthy = true
        } catch (_: Throwable) {
            healthy = false
        } finally {
            if (db.inTransaction()) db.endTransaction()
            noteHealthy(healthy)
        }
        if (healthy) {
            noteServerConflict(items.size)
            maybeCleanupQuarantine()
        }
        return healthy
    }

    private fun cleanupDelivered(db: SQLiteDatabase) {
        db.execSQL("DELETE FROM evidence WHERE acked=1 AND id < (SELECT COALESCE(MAX(id)-500,0) FROM evidence)")
    }
}
