package com.brick.safety.data

import android.content.ContentValues
import android.content.Context
import com.brick.safety.crypto.JournalCipher
import com.brick.safety.testing.BrickInstrumentationTestCase

@Suppress("DEPRECATION")
class Phase6DurabilityInstrumentedTest : BrickInstrumentationTestCase() {
    companion object {
        private const val CORE_DB = "brick_journal.db"
        private const val SAFETY_DB = "brick_safety_outbox.db"
        private const val CORE_BACKLOG_ROWS = 3_000
        private const val SAFETY_BACKLOG_ROWS = 2_000
        private const val TEST_EPOCH = 91
        private const val FOURTEEN_DAYS_MS = 14L * 24L * 60L * 60L * 1_000L
    }

    private lateinit var context: Context

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        context.deleteDatabase(CORE_DB)
        context.deleteDatabase(SAFETY_DB)
        context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit().clear().commit()
    }

    override fun tearDown() {
        context.deleteDatabase(CORE_DB)
        context.deleteDatabase(SAFETY_DB)
        super.tearDown()
    }

    fun testCoreJournalKeepsThreeThousandAgedPendingRowsAcrossReopenAndCleanup() {
        val oldCreatedMs = System.currentTimeMillis() - FOURTEEN_DAYS_MS - 86_400_000L

        Journal(context).use { journal ->
            assertTrue(journal.append(TEST_EPOCH, 1L, "seed-core".toByteArray()))
        }

        // Populate a realistic outage backlog efficiently inside one SQLite transaction. Reusing one
        // valid encrypted payload keeps this a retention/restart stress test rather than a keystore
        // benchmark while every row still exercises normal Journal decryption when read.
        val encryptedBulkPayload = JournalCipher.encrypt("bulk-core".toByteArray())
        val db = context.openOrCreateDatabase(CORE_DB, Context.MODE_PRIVATE, null)
        db.beginTransaction()
        try {
            db.execSQL("UPDATE packets SET created_ms=?", arrayOf(oldCreatedMs))
            for (seq in 2..CORE_BACKLOG_ROWS) {
                val row = ContentValues().apply {
                    put("epoch", TEST_EPOCH)
                    put("seq", seq.toLong())
                    put("payload", encryptedBulkPayload)
                    put("created_ms", oldCreatedMs)
                    put("acked", 0)
                }
                db.insertOrThrow("packets", null, row)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
            db.close()
        }

        Journal(context).use { reopened ->
            val stats = reopened.stats()
            assertEquals(CORE_BACKLOG_ROWS, stats.pendingCount)
            assertNotNull(stats.oldestPendingMs)
            assertTrue(System.currentTimeMillis() - requireNotNull(stats.oldestPendingMs) > FOURTEEN_DAYS_MS)

            val firstThousand = reopened.nextPending(1_000)
            assertEquals(1_000, firstThousand.size)
            assertEquals(1L, firstThousand.first().seq)
            assertEquals(1_000L, firstThousand.last().seq)
            assertEquals(CORE_BACKLOG_ROWS.toLong(), reopened.latestPending()?.seq)

            // A nonexistent ACK must not discard backlog. Successful ACK cleanup may delete delivered
            // rows, but must never age-evict or trim any still-pending packet.
            assertFalse(reopened.ackExact(TEST_EPOCH, CORE_BACKLOG_ROWS + 10_000L))
            assertEquals(CORE_BACKLOG_ROWS, reopened.stats().pendingCount)
            assertTrue(reopened.ackBatch(listOf(TEST_EPOCH to 1L, TEST_EPOCH to 1_500L)))
            assertEquals(CORE_BACKLOG_ROWS - 2, reopened.stats().pendingCount)
        }

        Journal(context).use { reopenedAgain ->
            assertEquals(CORE_BACKLOG_ROWS - 2, reopenedAgain.stats().pendingCount)
            assertEquals(2L, reopenedAgain.nextPending(1).single().seq)
            assertEquals(CORE_BACKLOG_ROWS.toLong(), reopenedAgain.latestPending()?.seq)
        }
    }

    fun testSafetyOutboxKeepsLargeAgedBacklogAndPrioritizesSosAcrossReopen() {
        val oldCreatedMs = System.currentTimeMillis() - FOURTEEN_DAYS_MS - 86_400_000L
        val sosId = "11111111-1111-4111-8111-111111111111"
        val safeId = "22222222-2222-4222-8222-222222222222"

        SafetyOutbox(context).use { outbox ->
            assertTrue(outbox.append(safeId, "safe_checkin", "safe".toByteArray(), 50))
            assertTrue(outbox.append(sosId, "sos_started", "sos".toByteArray(), 100))
        }

        val encryptedBulkPayload = JournalCipher.encrypt("normal-safety".toByteArray())
        val db = context.openOrCreateDatabase(SAFETY_DB, Context.MODE_PRIVATE, null)
        db.beginTransaction()
        try {
            db.execSQL("UPDATE safety_events SET created_ms=?", arrayOf(oldCreatedMs))
            for (i in 3..SAFETY_BACKLOG_ROWS) {
                val eventId = "30000000-0000-4000-8000-${i.toString().padStart(12, '0')}"
                val row = ContentValues().apply {
                    put("event_id", eventId)
                    put("kind", "battery_low")
                    put("payload", encryptedBulkPayload)
                    put("created_ms", oldCreatedMs)
                    put("priority", 1)
                    put("acked", 0)
                }
                db.insertOrThrow("safety_events", null, row)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
            db.close()
        }

        SafetyOutbox(context).use { reopened ->
            val stats = reopened.stats()
            assertEquals(SAFETY_BACKLOG_ROWS, stats.pendingCount)
            assertNotNull(stats.oldestPendingMs)
            assertTrue(System.currentTimeMillis() - requireNotNull(stats.oldestPendingMs) > FOURTEEN_DAYS_MS)

            val pending = reopened.pending(1_000)
            assertEquals(1_000, pending.size)
            assertEquals(sosId, pending[0].eventId)
            assertEquals(100, pending[0].priority)
            assertEquals(safeId, pending[1].eventId)
            assertEquals(50, pending[1].priority)

            assertFalse(reopened.ack("ffffffff-ffff-4fff-8fff-ffffffffffff"))
            assertEquals(SAFETY_BACKLOG_ROWS, reopened.stats().pendingCount)
            assertTrue(reopened.ack(sosId))
            assertEquals(SAFETY_BACKLOG_ROWS - 1, reopened.stats().pendingCount)
        }

        SafetyOutbox(context).use { reopenedAgain ->
            val pending = reopenedAgain.pending(1_000)
            assertEquals(safeId, pending.first().eventId)
            assertEquals(50, pending.first().priority)
            assertEquals(SAFETY_BACKLOG_ROWS - 1, reopenedAgain.stats().pendingCount)
        }
    }
}
