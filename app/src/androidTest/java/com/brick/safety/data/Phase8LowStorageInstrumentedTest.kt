package com.brick.safety.data

import android.content.Context
import android.database.sqlite.SQLiteFullException
import com.brick.safety.testing.BrickInstrumentationTestCase

@Suppress("DEPRECATION")
class Phase8LowStorageInstrumentedTest : BrickInstrumentationTestCase() {
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

    private fun fullDisk(): (String) -> Unit = { operation ->
        throw SQLiteFullException("Phase 8 synthetic ENOSPC during $operation")
    }

    fun testCoreJournalSqliteFullCannotLoseExistingDurableWorkOrAcceptNewWork() {
        Journal(context).use { journal ->
            assertTrue(journal.append(901, 1L, "already-durable".toByteArray()))
        }

        Journal(context, writeFaultInjector = fullDisk()).use { journal ->
            // ENOSPC before the insert must be contained and must not manufacture a durable success.
            assertFalse(journal.append(901, 2L, "new-work".toByteArray()))
            assertEquals(listOf(1L), journal.nextPending(10).map { it.seq })

            // ENOSPC while persisting an ACK must fail closed. The server may retry later, but Brick
            // may not delete or mark the row delivered until the local exact ACK mutation succeeds.
            assertFalse(journal.ackExact(901, 1L))
            assertEquals(listOf(1L), journal.nextPending(10).map { it.seq })
            assertEquals(1, journal.stats().pendingCount)
        }

        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertFalse(prefs.getBoolean("journalWriteHealthy", true))
        assertTrue(prefs.getLong("lastJournalWriteFailureWallMs", 0L) > 0L)

        // Removing the fault proves recovery requires no reboot/resync and the original row remains usable.
        Journal(context).use { recovered ->
            assertTrue(recovered.ackExact(901, 1L))
            assertEquals(0, recovered.stats().pendingCount)
        }
    }

    fun testSafetyOutboxSqliteFullCannotLoseExistingSosOrAcceptNewSos() {
        val first = "11111111-1111-4111-8111-111111111111"
        val second = "22222222-2222-4222-8222-222222222222"
        SafetyOutbox(context).use { outbox ->
            assertTrue(outbox.append(first, "sos_started", "already-durable".toByteArray(), 100))
        }

        SafetyOutbox(context, writeFaultInjector = fullDisk()).use { outbox ->
            assertFalse(outbox.append(second, "sos_started", "new-sos".toByteArray(), 100))
            val pending = outbox.pending(10)
            assertEquals(1, pending.size)
            assertEquals(first, pending.single().eventId)
            assertEquals(100, pending.single().priority)

            assertFalse(outbox.ack(first))
            assertEquals(first, outbox.pending(10).single().eventId)
            assertEquals(1, outbox.stats().pendingCount)
        }

        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertFalse(prefs.getBoolean("safetyOutboxWriteHealthy", true))
        assertTrue(prefs.getLong("lastSafetyOutboxWriteFailureWallMs", 0L) > 0L)

        SafetyOutbox(context).use { recovered ->
            assertTrue(recovered.ack(first))
            assertEquals(0, recovered.stats().pendingCount)
        }
    }
}
