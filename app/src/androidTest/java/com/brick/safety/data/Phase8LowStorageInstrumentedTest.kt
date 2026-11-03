package com.brick.safety.data

import android.content.Context
import android.database.sqlite.SQLiteException
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

    /**
     * Give the database only a small fixed growth budget, then consume that budget with an unrelated
     * filler table until SQLite itself reports SQLITE_FULL. This is intentionally stronger than merely
     * lowering max_page_count: WAL/cache behaviour can still let one oversized write through unless the
     * database has actually reached the enforced page ceiling first.
     */
    private fun fillDatabaseToHardCap(databaseName: String) {
        context.openOrCreateDatabase(databaseName, Context.MODE_PRIVATE, null).use { db ->
            runCatching { db.disableWriteAheadLogging() }
            db.execSQL("CREATE TABLE IF NOT EXISTS p8_storage_filler(id INTEGER PRIMARY KEY AUTOINCREMENT, payload BLOB NOT NULL)")

            val current = db.rawQuery("PRAGMA page_count", emptyArray()).use { c ->
                assertTrue(c.moveToFirst())
                c.getLong(0)
            }
            val requested = current + 16L
            val actual = db.rawQuery("PRAGMA max_page_count=$requested", emptyArray()).use { c ->
                assertTrue(c.moveToFirst())
                c.getLong(0)
            }
            assertTrue("SQLite max_page_count was not constrained", actual <= requested)

            var sawFull = false
            for (attempt in 0 until 128) {
                try {
                    // 64 KiB is deliberately much larger than the small remaining page budget.
                    db.execSQL("INSERT INTO p8_storage_filler(payload) VALUES(zeroblob(65536))")
                } catch (t: SQLiteException) {
                    sawFull = true
                    break
                }
            }
            assertTrue("SQLite fixture never reached its hard page cap", sawFull)

            val pages = db.rawQuery("PRAGMA page_count", emptyArray()).use { c ->
                assertTrue(c.moveToFirst())
                c.getLong(0)
            }
            val cap = db.rawQuery("PRAGMA max_page_count", emptyArray()).use { c ->
                assertTrue(c.moveToFirst())
                c.getLong(0)
            }
            assertTrue("fixture did not consume the configured database page budget", pages >= cap - 1L)
        }
    }

    private fun largePayload(): ByteArray = ByteArray(512 * 1024) { index -> (index % 251).toByte() }

    fun testCoreJournalFullDiskFailureKeepsExistingDurableRowAndReportsUnhealthy() {
        Journal(context).use { journal ->
            assertTrue(journal.append(901, 1L, "already-durable".toByteArray()))
        }
        fillDatabaseToHardCap("brick_journal.db")

        Journal(context).use { journal ->
            assertFalse("oversized write should fail after SQLite reached its page cap", journal.append(901, 2L, largePayload()))
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
        fillDatabaseToHardCap("brick_safety_outbox.db")

        SafetyOutbox(context).use { outbox ->
            assertFalse("oversized safety write should fail after SQLite reached its page cap", outbox.append(second, "sos_started", largePayload(), 100))
            val pending = outbox.pending(10)
            assertEquals(1, pending.size)
            assertEquals(first, pending.single().eventId)
            assertFalse(context.getSharedPreferences("brick", Context.MODE_PRIVATE).getBoolean("safetyOutboxWriteHealthy", true))
        }
    }
}
