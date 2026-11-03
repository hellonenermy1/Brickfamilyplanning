package com.brick.safety.data

import android.content.ContentValues
import android.content.Context
import com.brick.safety.crypto.JournalCipher
import com.brick.safety.testing.BrickInstrumentationTestCase

/**
 * 8C.11 synthetic backlog-scale test. We bulk-create already-encrypted durable rows in one SQLite
 * transaction so the test stresses Brick's production indexes/read/ACK/reopen paths at scale without
 * spending the whole CI budget generating 100,000 individual GPS callbacks.
 */
@Suppress("DEPRECATION")
class Phase8BacklogScaleInstrumentedTest : BrickInstrumentationTestCase() {
    companion object {
        private const val DB = "brick_journal.db"
        private const val EPOCH = 208
        private const val DAY_MS = 86_400_000L
    }

    private lateinit var context: Context

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        context.deleteDatabase(DB)
        context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit().clear().commit()
        Journal(context).use { it.writableDatabase }
    }

    override fun tearDown() {
        context.deleteDatabase(DB)
        super.tearDown()
    }

    fun testBacklog100To10kTo100kPreservesOrderingAndExactAck() {
        var inserted = 0
        for (target in listOf(100, 10_000, 100_000)) {
            bulkInsert(inserted + 1, target)
            inserted = target

            Journal(context).use { journal ->
                val stats = journal.stats()
                assertEquals("pending count at scale $target", target, stats.pendingCount)
                assertEquals(0, stats.quarantinedCount)
                assertEquals(target.toLong(), journal.maxSequence(EPOCH))

                val first = journal.nextPending(50)
                assertEquals(50, first.size)
                assertEquals((1L..50L).toList(), first.map { it.seq })
                assertEquals(target.toLong(), journal.latestPending()?.seq)
            }
        }

        Journal(context).use { journal ->
            assertTrue(journal.ackBatch((1L..50L).map { EPOCH to it }))
            assertEquals(99_950, journal.stats().pendingCount)
            assertEquals(51L, journal.nextPending(1).single().seq)
            assertEquals(100_000L, journal.latestPending()?.seq)
        }

        Journal(context).use { reopened ->
            assertEquals(99_950, reopened.stats().pendingCount)
            assertEquals(51L, reopened.nextPending(1).single().seq)
            assertEquals(100_000L, reopened.latestPending()?.seq)
        }
    }

    fun testSevenAndFourteenDayEquivalentBacklogsRetainTruthfulOldestAge() {
        bulkInsert(1, 100)
        val now = System.currentTimeMillis()
        val fourteenDaysAgo = now - 14L * DAY_MS
        val sevenDaysAgo = now - 7L * DAY_MS

        context.openOrCreateDatabase(DB, Context.MODE_PRIVATE, null).use { db ->
            assertEquals(
                1,
                db.update(
                    "packets",
                    ContentValues().apply { put("created_ms", fourteenDaysAgo) },
                    "epoch=? AND seq=?",
                    arrayOf(EPOCH.toString(), "1")
                )
            )
            assertEquals(
                1,
                db.update(
                    "packets",
                    ContentValues().apply { put("created_ms", sevenDaysAgo) },
                    "epoch=? AND seq=?",
                    arrayOf(EPOCH.toString(), "2")
                )
            )
        }

        Journal(context).use { journal ->
            val stats = journal.stats()
            assertEquals(100, stats.pendingCount)
            assertEquals(fourteenDaysAgo, stats.oldestPendingMs)
            assertEquals((1L..50L).toList(), journal.nextPending(50).map { it.seq })
        }

        // Once the 14-day-old row is exactly ACKed, the remaining oldest record is the 7-day row.
        Journal(context).use { journal ->
            assertTrue(journal.ackExact(EPOCH, 1L))
            val stats = journal.stats()
            assertEquals(99, stats.pendingCount)
            assertEquals(sevenDaysAgo, stats.oldestPendingMs)
        }

        Journal(context).use { reopened ->
            assertEquals(99, reopened.stats().pendingCount)
            assertEquals(sevenDaysAgo, reopened.stats().oldestPendingMs)
            assertEquals(2L, reopened.nextPending(1).single().seq)
        }
    }

    private fun bulkInsert(fromSeq: Int, toSeq: Int) {
        if (fromSeq > toSeq) return
        val encrypted = JournalCipher.encrypt(ByteArray(90) { index -> (index and 0xff).toByte() })
        context.openOrCreateDatabase(DB, Context.MODE_PRIVATE, null).use { db ->
            db.beginTransaction()
            try {
                val created = System.currentTimeMillis()
                for (seq in fromSeq..toSeq) {
                    val row = db.insertOrThrow("packets", null, ContentValues().apply {
                        put("epoch", EPOCH)
                        put("seq", seq.toLong())
                        put("payload", encrypted)
                        put("created_ms", created - (toSeq - seq).toLong())
                        put("acked", 0)
                    })
                    assertTrue(row > 0L)
                }
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
        }
    }
}
