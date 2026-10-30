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

    fun append(epoch: Int, seq: Long, payload: ByteArray): Boolean {
        return try {
            val rowId = writableDatabase.insertWithOnConflict("packets", null, ContentValues().apply {
                put("epoch", epoch)
                put("seq", seq)
                put("payload", JournalCipher.encrypt(payload))
                put("created_ms", System.currentTimeMillis())
            }, SQLiteDatabase.CONFLICT_IGNORE)
            val ok = rowId != -1L
            healthPrefs.edit()
                .putBoolean("journalWriteHealthy", ok)
                .apply {
                    if (!ok) putLong("lastJournalWriteFailureWallMs", System.currentTimeMillis())
                }
                .apply()
            ok
        } catch (_: Throwable) {
            healthPrefs.edit()
                .putBoolean("journalWriteHealthy", false)
                .putLong("lastJournalWriteFailureWallMs", System.currentTimeMillis())
                .apply()
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

    fun ackExact(epoch: Int, seq: Long) {
        writableDatabase.execSQL("UPDATE packets SET acked=1 WHERE epoch=? AND seq=?", arrayOf<Any>(epoch, seq))
        writableDatabase.execSQL("DELETE FROM packets WHERE acked=1 AND id < (SELECT COALESCE(MAX(id)-500,0) FROM packets)")
    }
}
