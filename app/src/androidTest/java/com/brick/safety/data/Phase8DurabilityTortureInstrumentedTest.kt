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

            assertFalse(journal.ackBatch(listOf(EPOCH to 1L, EPOCH to 999_999L)))
            assertEquals(listOf(1L, 2L, 3L), journal.nextPending(10).map { it.seq })

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
            assertTrue(outbox.append(eventId, "sos_started", "same-logical-event".toByteArray(), 100))
            assertEquals(1, outbox.stats().pendingCount)
            assertEquals(eventId, outbox.pending(10).single().eventId)
        }

        SafetyOutbox(context).use { reopened ->
            assertEquals(1, reopened.stats().pendingCount)
            assertEquals(eventId, reopened.pending(10).single().eventId)
            assertTrue(reopened.ack(eventId))
            assertFalse(reopened.ack(eventId))
            assertEquals(0, reopened.stats().pendingCount)
        }
    }

    fun testSafeCheckInSurvivesReopenUntilExactAck() {
        val eventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        SafetyOutbox(context).use { outbox ->
            assertTrue(outbox.append(eventId, "safe_checkin", "im-safe".toByteArray(), 1))
            val pending = outbox.pending(10).single()
            assertEquals(eventId, pending.eventId)
            assertEquals("safe_checkin", pending.kind)
            assertEquals(1, pending.priority)
        }

        SafetyOutbox(context).use { reopened ->
            val pending = reopened.pending(10).single()
            assertEquals(eventId, pending.eventId)
            assertEquals("safe_checkin", pending.kind)
            assertTrue(reopened.ack(eventId))
        }

        SafetyOutbox(context).use { reopenedAgain ->
            assertEquals(0, reopenedAgain.stats().pendingCount)
            assertFalse(reopenedAgain.ack(eventId))
        }
    }

    fun testCorruptHighPrioritySafetyRowCannotStarveSos() {
        val corruptId = "22222222-2222-4222-8222-222222222222"
        val sosId = "33333333-3333-4333-8333-333333333333"
        val normalId = "44444444-4444-4444-8444-444444444444"

        SafetyOutbox(context).use { outbox ->
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

    fun testSosEventAndAuthoritativeStateSurviveReopenTogether() {
        val startId = "55555555-5555-4555-8555-555555555555"
        val endId = "66666666-6666-4666-8666-666666666666"
        SafetyOutbox(context).use { outbox ->
            assertTrue(outbox.appendSosTransition(startId, "sos_started", "start".toByteArray(), 200, true))
            assertTrue(outbox.sosActive(false))
            assertEquals(startId, outbox.pending(10).single().eventId)
        }

        SafetyOutbox(context).use { reopened ->
            assertTrue(reopened.sosActive(false))
            assertEquals(startId, reopened.pending(10).single().eventId)
            assertTrue(reopened.appendSosTransition(endId, "sos_cancelled", "end".toByteArray(), 200, false))
            assertFalse(reopened.sosActive(true))
        }

        SafetyOutbox(context).use { reopenedAgain ->
            assertFalse(reopenedAgain.sosActive(true))
            assertEquals(listOf(startId, endId), reopenedAgain.pending(10).map { it.eventId })
        }
    }

    fun testSosTransitionFaultCannotCommitEventWithoutState() {
        val eventId = "77777777-7777-4777-8777-777777777777"
        SafetyOutbox(context) { operation ->
            if (operation == "append_sos_transition") throw IllegalStateException("injected write failure")
        }.use { outbox ->
            assertFalse(outbox.appendSosTransition(eventId, "sos_started", "start".toByteArray(), 200, true))
        }

        SafetyOutbox(context).use { reopened ->
            assertEquals(0, reopened.stats().pendingCount)
            assertFalse(reopened.sosActive(false))
        }
    }

    fun testHighFallEventAndProtectionDeadlineSurviveReopenTogether() {
        val eventId = "88888888-8888-4888-8888-888888888888"
        val deadline = System.currentTimeMillis() + 120_000L
        SafetyOutbox(context).use { outbox ->
            assertTrue(outbox.appendHighFall(eventId, "fall_detected", "high".toByteArray(), 100, deadline))
            assertEquals(deadline, outbox.highFallUntilMs(0L))
            assertEquals(eventId, outbox.pending(10).single().eventId)
        }

        SafetyOutbox(context).use { reopened ->
            assertEquals(deadline, reopened.highFallUntilMs(0L))
            assertEquals(eventId, reopened.pending(10).single().eventId)
        }
    }

    fun testHighFallFaultCannotCommitEventWithoutProtectionState() {
        val eventId = "99999999-9999-4999-8999-999999999999"
        val deadline = System.currentTimeMillis() + 120_000L
        SafetyOutbox(context) { operation ->
            if (operation == "append_high_fall") throw IllegalStateException("injected write failure")
        }.use { outbox ->
            assertFalse(outbox.appendHighFall(eventId, "fall_detected", "high".toByteArray(), 100, deadline))
        }

        SafetyOutbox(context).use { reopened ->
            assertEquals(0, reopened.stats().pendingCount)
            assertEquals(0L, reopened.highFallUntilMs(0L))
        }
    }
}
