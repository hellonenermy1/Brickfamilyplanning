package com.brick.safety.data

import android.content.ContentValues
import android.content.Context
import com.brick.safety.testing.BrickInstrumentationTestCase

@Suppress("DEPRECATION")
class Phase8DurabilityTortureInstrumentedTest : BrickInstrumentationTestCase() {
    companion object {
        private const val CORE_DB = "brick_journal.db"
        private const val SAFETY_DB = "brick_safety_outbox.db"
        private const val EPOCH = 108
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

    fun testJournalAckBatchIsAtomicAndOutOfOrderAckOnlyDeletesExactRows() {
        Journal(context).use { journal ->
            for (seq in 1L..3L) {
                assertTrue(journal.append(EPOCH, seq, "payload-$seq".toByteArray()))
            }

            // Simulate a mixed server response containing one valid ACK and one stale/unknown ACK.
            // The transaction must roll back rather than silently losing the valid row.
            assertFalse(journal.ackBatch(listOf(EPOCH to 1L, EPOCH to 999_999L)))
            assertEquals(listOf(1L, 2L, 3L), journal.nextPending(10).map { it.seq })

            // Valid ACKs may arrive out of order. Only those exact logical records may disappear.
            assertTrue(journal.ackBatch(listOf(EPOCH to 3L, EPOCH to 1L)))
            assertEquals(listOf(2L), journal.nextPending(10).map { it.seq })
            assertEquals(1, journal.stats().pendingCount)
        }

        Journal(context).use { reopened ->
            assertEquals(listOf(2L), reopened.nextPending(10).map { it.seq })
            assertEquals(1, reopened.stats().pendingCount)
        }
    }

    fun testJournalCorruptRecordIsQuarantinedWithoutBlockingLaterBacklog() {
        Journal(context).use { journal ->
            assertTrue(journal.append(EPOCH, 1L, "first".toByteArray()))
            assertTrue(journal.append(EPOCH, 2L, "second".toByteArray()))
        }

        // Fault injection: emulate a torn/corrupt encrypted row. It must never be ACKed as delivered,
        // but it also must not poison the rest of a long offline queue.
        context.openOrCreateDatabase(CORE_DB, Context.MODE_PRIVATE, null).use { db ->
            val changed = db.update(
                "packets",
                ContentValues().apply { put("payload", byteArrayOf(0x01, 0x02, 0x03)) },
                "epoch=? AND seq=?",
                arrayOf(EPOCH.toString(), "1")
            )
            assertEquals(1, changed)
        }

        Journal(context).use { journal ->
            val pending = journal.nextPending(10)
            assertEquals(1, pending.size)
            assertEquals(2L, pending.single().seq)
            assertEquals("second", pending.single().payload.toString(Charsets.UTF_8))
            val stats = journal.stats()
            assertEquals(1, stats.pendingCount)
            assertEquals(1, stats.quarantinedCount)
        }

        Journal(context).use { reopened ->
            assertEquals(1, reopened.stats().pendingCount)
            assertEquals(1, reopened.stats().quarantinedCount)
            assertEquals(2L, reopened.nextPending(1).single().seq)
        }
    }

    fun testSafetyDuplicateAppendIsLogicalIdempotencyAcrossRestart() {
        val eventId = "11111111-1111-4111-8111-111111111111"
        SafetyOutbox(context).use { outbox ->
            assertTrue(outbox.append(eventId, "sos_started", "same-logical-event".toByteArray(), 100))
            // A retry before/after a lost network ACK must not create another logical event locally.
            assertTrue(outbox.append(eventId, "sos_started", "same-logical-event".toByteArray(), 100))
            assertEquals(1, outbox.stats().pendingCount)
            assertEquals(eventId, outbox.pending(10).single().eventId)
        }

        SafetyOutbox(context).use { reopened ->
            assertEquals(1, reopened.stats().pendingCount)
            assertEquals(eventId, reopened.pending(10).single().eventId)
            assertTrue(reopened.ack(eventId))
            // Duplicate/stale ACK is harmless and cannot delete any unrelated future record.
            assertFalse(reopened.ack(eventId))
            assertEquals(0, reopened.stats().pendingCount)
        }
    }

    fun testCorruptHighPrioritySafetyRowCannotStarveSos() {
        val corruptId = "22222222-2222-4222-8222-222222222222"
        val sosId = "33333333-3333-4333-8333-333333333333"
        val normalId = "44444444-4444-4444-8444-444444444444"

        SafetyOutbox(context).use { outbox ->
            // Put the corrupt row first at the same critical priority so pending() encounters it before
            // the SOS; the SOS must still be returned in this same drain rather than being blocked.
            assertTrue(outbox.append(corruptId, "critical_probe", "corrupt-me".toByteArray(), 100))
            assertTrue(outbox.append(sosId, "sos_started", "sos".toByteArray(), 100))
            assertTrue(outbox.append(normalId, "battery_low", "normal".toByteArray(), 1))
        }

        context.openOrCreateDatabase(SAFETY_DB, Context.MODE_PRIVATE, null).use { db ->
            val changed = db.update(
                "safety_events",
                ContentValues().apply { put("payload", byteArrayOf(0x7f)) },
                "event_id=?",
                arrayOf(corruptId)
            )
            assertEquals(1, changed)
        }

        SafetyOutbox(context).use { outbox ->
            val pending = outbox.pending(10)
            assertEquals(2, pending.size)
            assertEquals(sosId, pending[0].eventId)
            assertEquals(100, pending[0].priority)
            assertEquals(normalId, pending[1].eventId)
            assertEquals(1, outbox.stats().quarantinedCount)
            assertEquals(2, outbox.stats().pendingCount)
            assertTrue(outbox.ack(sosId))
        }

        SafetyOutbox(context).use { reopened ->
            val stats = reopened.stats()
            assertEquals(1, stats.pendingCount)
            assertEquals(1, stats.quarantinedCount)
            assertEquals(normalId, reopened.pending(10).single().eventId)
        }
    }
}
