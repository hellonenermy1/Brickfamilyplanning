package com.brick.safety.data

import android.content.Context
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

    private fun constrainToOneExtraPage(databaseName: String) {
        context.openOrCreateDatabase(databaseName, Context.MODE_PRIVATE, null).use { db ->
            val current = db.rawQuery("PRAGMA page_count", emptyArray()).use { c ->
                assertTrue(c.moveToFirst())
                c.getLong(0)
            }
            val requested = current + 1L
            val actual = db.rawQuery("PRAGMA max_page_count=$requested", emptyArray()).use { c ->
                assertTrue(c.moveToFirst())
                c.getLong(0)
            }
            assertTrue("SQLite max_page_count was not constrained", actual <= requested)
        }
    }

    private fun largePayload(): ByteArray = ByteArray(512 * 1024) { index -> (index % 251).toByte() }

    fun testCoreJournalFullDiskFailureKeepsExistingDurableRowAndReportsUnhealthy() {
        Journal(context).use { journal ->
            assertTrue(journal.append(901, 1L, "already-durable".toByteArray()))
        }
        constrainToOneExtraPage("brick_journal.db")

        Journal(context).use { journal ->
            assertFalse("oversized write should fail under constrained SQLite pages", journal.append(901, 2L, largePayload()))
            assertEquals(listOf(1L), journal.nextPending(10).map { it.seq })
            assertFalse(context.getSharedPreferences("brick", Context.MODE_PRIVATE).getBoolean("journalWriteHealthy", true))
        }
    }

    fun testSafetyOutboxFullDiskFailureKeepsExistingSafetyEventAndReportsUnhealthy() {
        val first = "11111111-1111-4111-8111-111111111111"
        val second = "22222222-2222-4222-8222-222222222222"
        SafetyOutbox(context).use { outbox ->
            assertTrue(outbox.append(first, "sos_started", "already-durable".toByteArray(), 100))
        }
        constrainToOneExtraPage("brick_safety_outbox.db")

        SafetyOutbox(context).use { outbox ->
            assertFalse("oversized safety write should fail under constrained SQLite pages", outbox.append(second, "sos_started", largePayload(), 100))
            val pending = outbox.pending(10)
            assertEquals(1, pending.size)
            assertEquals(first, pending.single().eventId)
            assertFalse(context.getSharedPreferences("brick", Context.MODE_PRIVATE).getBoolean("safetyOutboxWriteHealthy", true))
        }
    }
}
