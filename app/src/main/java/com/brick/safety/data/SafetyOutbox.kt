package com.brick.safety.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.brick.safety.crypto.JournalCipher

class SafetyOutbox(context: Context) : SQLiteOpenHelper(context, "brick_safety_outbox.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE safety_events(id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, payload BLOB NOT NULL, created_ms INTEGER NOT NULL, priority INTEGER NOT NULL DEFAULT 1, acked INTEGER NOT NULL DEFAULT 0)")
        db.execSQL("CREATE INDEX idx_safety_pending ON safety_events(acked,priority,id)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    data class Pending(val rowId: Long, val eventId: String, val kind: String, val payload: ByteArray, val priority: Int)
    data class Stats(val pendingCount: Int, val oldestPendingMs: Long?)

    fun append(eventId: String, kind: String, payload: ByteArray, priority: Int) {
        writableDatabase.insertWithOnConflict("safety_events", null, ContentValues().apply {
            put("event_id", eventId)
            put("kind", kind)
            put("payload", JournalCipher.encrypt(payload))
            put("created_ms", System.currentTimeMillis())
            put("priority", priority)
        }, SQLiteDatabase.CONFLICT_IGNORE)
    }

    fun pending(limit: Int = 50): List<Pending> {
        val out = mutableListOf<Pending>()
        readableDatabase.rawQuery(
            "SELECT id,event_id,kind,payload,priority FROM safety_events WHERE acked=0 ORDER BY priority DESC,id ASC LIMIT ?",
            arrayOf(limit.toString())
        ).use { c ->
            while (c.moveToNext()) out += Pending(c.getLong(0), c.getString(1), c.getString(2), JournalCipher.decrypt(c.getBlob(3)), c.getInt(4))
        }
        return out
    }

    fun ack(eventId: String) {
        writableDatabase.execSQL("UPDATE safety_events SET acked=1 WHERE event_id=?", arrayOf(eventId))
        writableDatabase.execSQL("DELETE FROM safety_events WHERE acked=1 AND id < (SELECT COALESCE(MAX(id)-200,0) FROM safety_events)")
    }

    fun stats(): Stats {
        readableDatabase.rawQuery("SELECT COUNT(*),MIN(created_ms) FROM safety_events WHERE acked=0", emptyArray()).use { c ->
            c.moveToFirst()
            return Stats(c.getInt(0), if (c.isNull(1)) null else c.getLong(1))
        }
    }
}
