package com.brick.safety.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.brick.safety.crypto.JournalCipher

class Journal(context: Context) : SQLiteOpenHelper(context, "brick_journal.db", null, 1) {
    private val healthPrefs = context.applicationContext.getSharedPreferences("brick", Context.MODE_PRIVATE)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE packets(id INTEGER PRIMARY KEY AUTOINCREMENT, epoch INTEGER NOT NULL, seq INTEGER NOT NULL, payload BLOB NOT NULL, created_ms INTEGER NOT NULL, acked INTEGER NOT NULL DEFAULT 0, UNIQUE(epoch,seq))")
        db.execSQL("CREATE INDEX idx_packets_pending ON packets(acked,id)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    private fun noteJournalHealthy(healthy: Boolean) {
        healthPrefs.edit()
            .putBoolean("journalWriteHealthy", healthy)
            .apply {
                if (!healthy) putLong("lastJournalWriteFailureWallMs", System.currentTimeMillis())
            }
            .apply()
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
    data class Stats(val pendingCount: Int, val oldestPendingMs: Long?)

    fun latestPending(): Pending? {
        readableDatabase.rawQuery(
            "SELECT id,epoch,seq,payload FROM packets WHERE acked=0 ORDER BY id DESC LIMIT 1",
            emptyArray()
        ).use { c ->
            if (!c.moveToFirst()) return null
            return Pending(c.getLong(0), c.getInt(1), c.getLong(2), JournalCipher.decrypt(c.getBlob(3)))
        }
    }

    fun nextPending(limit: Int = 100): List<Pending> {
        val out = mutableListOf<Pending>()
        readableDatabase.rawQuery("SELECT id,epoch,seq,payload FROM packets WHERE acked=0 ORDER BY id LIMIT ?", arrayOf(limit.toString())).use { c ->
            while (c.moveToNext()) out += Pending(c.getLong(0), c.getInt(1), c.getLong(2), JournalCipher.decrypt(c.getBlob(3)))
        }
        return out
    }

    fun stats(): Stats {
        readableDatabase.rawQuery(
            "SELECT COUNT(*), MIN(created_ms) FROM packets WHERE acked=0",
            emptyArray()
        ).use { c ->
            c.moveToFirst()
            return Stats(c.getInt(0), if (c.isNull(1)) null else c.getLong(1))
        }
    }

    private fun cleanupDelivered(db: SQLiteDatabase) {
        db.execSQL("DELETE FROM packets WHERE acked=1 AND id < (SELECT COALESCE(MAX(id)-500,0) FROM packets)")
    }

    fun ackExact(epoch: Int, seq: Long): Boolean {
        return ackBatch(listOf(epoch to seq))
    }

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
