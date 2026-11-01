package com.brick.safety.reliability

import android.content.Context
import com.brick.safety.data.Journal
import com.brick.safety.data.SafetyOutbox
import com.brick.safety.testing.BrickInstrumentationTestCase

/**
 * Phase 6B computer-side durability proof.
 *
 * These are deliberately database/restart tests rather than network mocks: they prove the local
 * CREATE-before-SEND contract survives process-style close/reopen cycles, long outage age and a
 * thousand-plus queued records without relying on a live phone or Cloudflare.
 */
class Phase6BDurabilityInstrumentedTest : BrickInstrumentationTestCase() {
    private lateinit var context: Context

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        context.deleteDatabase("brick_journal.db")
        context.deleteDatabase("brick_safety_outbox.db")
        context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit().clear().commit()
    }

    override fun tearDown() {
        context.deleteDatabase("brick_journal.db")
        context.deleteDatabase("brick_safety_outbox.db")
        super.tearDown()
    }

    fun testCoreJournalKeepsMoreThanFourteenDayBacklogAndThousandsOfPendingRecords() {
        val epoch = 606
        val total = 1_200
        Journal(context).use { journal ->
            for (sequence in 1..total) {
                val payload = "phase6b-backlog-$sequence".toByteArray(Charsets.UTF_8)
                assertTrue("append failed at sequence $sequence", journal.append(epoch, sequence.toLong(), payload))
            }
            assertEquals(total, journal.stats().pendingCount)
            assertEquals(total.toLong(), journal.maxSequence(epoch))
        }

        // Simulate a prolonged offline outage. Pending rows are intentionally not age-expired.
        val fifteenDaysAgo = System.currentTimeMillis() - 15L * 24L * 60L * 60L * 1_000L
        context.openOrCreateDatabase("brick_journal.db", Context.MODE_PRIVATE, null).use { db ->
            db.execSQL("UPDATE packets SET created_ms=? WHERE acked=0", arrayOf(fifteenDaysAgo))
        }

        // A fresh helper instance models a process restart/reopen. Nothing may require a sync/reboot.
        Journal(context).use { reopened ->
            val stats = reopened.stats()
            assertEquals(total, stats.pendingCount)
            assertNotNull(stats.oldestPendingMs)
            assertTrue(requireNotNull(stats.oldestPendingMs) <= fifteenDaysAgo + 5_000L)
            assertEquals(total.toLong(), reopened.maxSequence(epoch))

            val firstBatch = reopened.nextPending(1_000)
            assertEquals(1_000, firstBatch.size)
            assertEquals(1L, firstBatch.first().seq)
            assertEquals(1_000L, firstBatch.last().seq)
            assertEquals("phase6b-backlog-1", firstBatch.first().payload.toString(Charsets.UTF_8))

            val exactAcks = firstBatch.take(100).map { it.epoch to it.seq }
            assertTrue(reopened.ackBatch(exactAcks))
            assertEquals(total - 100, reopened.stats().pendingCount)
        }

        // ACK state itself must also survive another reopen.
        Journal(context).use { reopenedAgain ->
            assertEquals(total - 100, reopenedAgain.stats().pendingCount)
            assertEquals(101L, requireNotNull(reopenedAgain.nextPending(1).singleOrNull()).seq)
        }
    }

    fun testSosAndSafeCheckinAreDurablePrioritizedIdempotentAndRestartSafe() {
        val normalId = "00000000-0000-4000-8000-000000000001"
        val safeId = "00000000-0000-4000-8000-000000000002"
        val sosId = "00000000-0000-4000-8000-000000000003"
        val normalPayload = "normal-event".toByteArray(Charsets.UTF_8)
        val safePayload = "safe-checkin".toByteArray(Charsets.UTF_8)
        val sosPayload = "sos-started".toByteArray(Charsets.UTF_8)

        SafetyOutbox(context).use { outbox ->
            assertTrue(outbox.append(normalId, "battery_low", normalPayload, SafetyDispatcher.PRIORITY_NORMAL))
            assertTrue(outbox.append(safeId, "safe_checkin", safePayload, SafetyDispatcher.PRIORITY_IMPORTANT))
            assertTrue(outbox.append(sosId, "sos_started", sosPayload, SafetyDispatcher.PRIORITY_CRITICAL))

            // Retrying CREATE with the same event ID is idempotent and must not duplicate it.
            assertTrue(outbox.append(sosId, "sos_started", sosPayload, SafetyDispatcher.PRIORITY_CRITICAL))
            assertEquals(3, outbox.stats().pendingCount)
        }

        // Reopening models app/process restart before any network ACK arrives.
        SafetyOutbox(context).use { reopened ->
            val pending = reopened.pending(10)
            assertEquals(3, pending.size)
            assertEquals(sosId, pending[0].eventId)
            assertEquals("sos_started", pending[0].kind)
            assertEquals(SafetyDispatcher.PRIORITY_CRITICAL, pending[0].priority)
            assertEquals("sos-started", pending[0].payload.toString(Charsets.UTF_8))
            assertEquals(safeId, pending[1].eventId)
            assertEquals("safe_checkin", pending[1].kind)
            assertEquals(SafetyDispatcher.PRIORITY_IMPORTANT, pending[1].priority)
            assertEquals("safe-checkin", pending[1].payload.toString(Charsets.UTF_8))

            assertTrue(reopened.ack(sosId))
            assertEquals(2, reopened.stats().pendingCount)
        }

        // Delivered SOS stays delivered; the unacknowledged I’M SAFE event remains pending.
        SafetyOutbox(context).use { reopenedAgain ->
            val pending = reopenedAgain.pending(10)
            assertEquals(2, pending.size)
            assertFalse(pending.any { it.eventId == sosId })
            assertTrue(pending.any { it.eventId == safeId && it.kind == "safe_checkin" })
        }
    }
}
