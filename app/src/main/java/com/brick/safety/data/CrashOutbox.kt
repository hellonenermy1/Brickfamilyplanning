package com.brick.safety.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.brick.safety.crypto.JournalCipher

class CrashOutbox(context: Context) : SQLiteOpenHelper(context, "brick_crash_outbox.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE crash_reports(id INTEGER PRIMARY KEY AUTOINCREMENT, report_id TEXT NOT NULL UNIQUE, payload BLOB NOT NULL, created_ms INTEGER NOT NULL, acked INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE INDEX idx_crash_pending ON crash_reports(acked,id)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    data class Pending(val reportId: String, val payload: ByteArray)

    fun append(reportId: String, payload: ByteArray) {
        writableDatabase.insertWithOnConflict("crash_reports", null, ContentValues().apply {
            put("report_id", reportId)
            put("payload", JournalCipher.encrypt(payload))
            put("created_ms", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_IGNORE)
    }

    fun pending(limit: Int = 10): List<Pending> {
        val out = mutableListOf<Pending>()
        readableDatabase.rawQuery(
            "SELECT report_id,payload FROM crash_reports WHERE acked=0 ORDER BY id ASC LIMIT ?",
            arrayOf(limit.coerceIn(1, 50).toString())
        ).use { c ->
            while (c.moveToNext()) out += Pending(c.getString(0), JournalCipher.decrypt(c.getBlob(1)))
        }
        return out
    }

    fun ack(reportId: String) {
        writableDatabase.execSQL("UPDATE crash_reports SET acked=1 WHERE report_id=?", arrayOf(reportId))
        writableDatabase.execSQL("DELETE FROM crash_reports WHERE acked=1 AND id < (SELECT COALESCE(MAX(id)-100,0) FROM crash_reports)")
    }

    fun pendingCount(): Int {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM crash_reports WHERE acked=0", emptyArray()).use { c ->
            c.moveToFirst()
            return c.getInt(0)
        }
    }
}
