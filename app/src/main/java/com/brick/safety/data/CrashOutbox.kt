package com.brick.safety.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.brick.safety.crypto.JournalCipher

class CrashOutbox(context: Context) : SQLiteOpenHelper(context, "brick_crash_outbox.db", null, 1) {
    companion object { private const val MAX_PENDING_DIAGNOSTICS = 500 }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE crash_reports(id INTEGER PRIMARY KEY AUTOINCREMENT, report_id TEXT NOT NULL UNIQUE, payload BLOB NOT NULL, created_ms INTEGER NOT NULL, acked INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE INDEX idx_crash_pending ON crash_reports(acked,id)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    data class Pending(val reportId: String, val payload: ByteArray)

    private fun quarantine(rowId: Long) {
        runCatching {
            writableDatabase.update(
                "crash_reports",
                ContentValues().apply { put("acked", 2) },
                "id=? AND acked=0",
                arrayOf(rowId.toString())
            )
        }
    }

    fun append(reportId: String, payload: ByteArray) {
        writableDatabase.insertWithOnConflict("crash_reports", null, ContentValues().apply {
            put("report_id", reportId)
            put("payload", JournalCipher.encrypt(payload))
            put("created_ms", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_IGNORE)
        // Diagnostics are lower priority than location evidence. Keep the newest pending diagnostics only.
        // This threshold is derived from pending rows, so newer acknowledged/quarantined rows cannot evict unsent diagnostics.
        writableDatabase.execSQL(
            "DELETE FROM crash_reports WHERE acked=0 AND id < COALESCE((SELECT MIN(id) FROM (SELECT id FROM crash_reports WHERE acked=0 ORDER BY id DESC LIMIT ?)),0)",
            arrayOf(MAX_PENDING_DIAGNOSTICS)
        )
    }

    fun pending(limit: Int = 10): List<Pending> {
        val safeLimit = limit.coerceIn(1, 50)
        val out = mutableListOf<Pending>()
        readableDatabase.rawQuery(
            "SELECT id,report_id,payload FROM crash_reports WHERE acked=0 ORDER BY id ASC LIMIT ?",
            arrayOf((safeLimit + 16).toString())
        ).use { c ->
            while (c.moveToNext() && out.size < safeLimit) {
                val rowId = c.getLong(0)
                val payload = try { JournalCipher.decrypt(c.getBlob(2)) } catch (_: Throwable) {
                    quarantine(rowId)
                    continue
                }
                out += Pending(c.getString(1), payload)
            }
        }
        return out
    }

    fun ack(reportId: String): Boolean {
        return try {
            val changed = writableDatabase.update(
                "crash_reports",
                ContentValues().apply { put("acked", 1) },
                "report_id=? AND acked=0",
                arrayOf(reportId)
            )
            if (changed != 1) return false
            writableDatabase.execSQL("DELETE FROM crash_reports WHERE acked=1 AND id < (SELECT COALESCE(MAX(id)-100,0) FROM crash_reports)")
            true
        } catch (_: Throwable) {
            false
        }
    }

    fun pendingCount(): Int {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM crash_reports WHERE acked=0", emptyArray()).use { c ->
            c.moveToFirst()
            return c.getInt(0)
        }
    }
}
