package com.brick.safety.reliability

import android.content.Context
import com.brick.safety.data.Journal
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLHandshakeException

class Phase8NetworkChaosInstrumentedTest : BrickInstrumentationTestCase() {
    private lateinit var context: Context

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        context.deleteDatabase("brick_journal.db")
        context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit().clear().commit()
    }

    override fun tearDown() {
        context.deleteDatabase("brick_journal.db")
        super.tearDown()
    }

    fun testDnsTlsTimeout429And5xxCannotDeleteDurableLocation() {
        Journal(context).use { journal ->
            assertTrue(journal.append(808, 1L, "durable-location".toByteArray()))
            val pending = journal.nextPending(1).single()

            val failures: List<Throwable> = listOf(
                UnknownHostException("synthetic DNS failure"),
                SSLHandshakeException("synthetic TLS failure"),
                SocketTimeoutException("synthetic timeout"),
                IllegalStateException("Upload failed 429: synthetic rate limit"),
                IllegalStateException("Upload failed 503: synthetic server failure")
            )
            for (failure in failures) {
                assertFalse(
                    DurableLocationDelivery.sendOne(journal, pending) { throw failure }
                )
                assertEquals(listOf(1L), journal.nextPending(10).map { it.seq })
            }

            // A lost/corrupt ACK is exactly as non-authoritative as a transport exception.
            assertFalse(DurableLocationDelivery.sendOne(journal, pending) { 999_999L })
            assertEquals(listOf(1L), journal.nextPending(10).map { it.seq })

            // Simulate transport switching/recovery: the same durable row is retried and only the
            // exact ACK may finally remove it.
            assertTrue(DurableLocationDelivery.sendOne(journal, pending) { 1L })
            assertEquals(0, journal.stats().pendingCount)
        }
    }

    fun testPartialDuplicateOrUnknownBatchAckCannotPartiallyDeleteBacklog() {
        Journal(context).use { journal ->
            assertTrue(journal.append(809, 1L, "one".toByteArray()))
            assertTrue(journal.append(809, 2L, "two".toByteArray()))
            val batch = journal.nextPending(10)
            assertEquals(2, batch.size)

            assertFalse(DurableLocationDelivery.sendBatch(journal, batch) { listOf(809 to 1L) })
            assertEquals(listOf(1L, 2L), journal.nextPending(10).map { it.seq })

            assertFalse(DurableLocationDelivery.sendBatch(journal, batch) { listOf(809 to 1L, 809 to 1L) })
            assertEquals(listOf(1L, 2L), journal.nextPending(10).map { it.seq })

            assertFalse(DurableLocationDelivery.sendBatch(journal, batch) { listOf(809 to 1L, 809 to 999L) })
            assertEquals(listOf(1L, 2L), journal.nextPending(10).map { it.seq })

            assertTrue(DurableLocationDelivery.sendBatch(journal, batch) { listOf(809 to 2L, 809 to 1L) })
            assertEquals(0, journal.stats().pendingCount)
        }
    }

    fun testCoreRetryBackoffIsBoundedAndMonotonic() {
        val expected = listOf(
            5_000L,
            10_000L,
            20_000L,
            40_000L,
            80_000L,
            160_000L,
            300_000L,
            300_000L,
            300_000L
        )
        assertEquals(expected, (1..9).map(CoreUploadRetryPolicy::delayMs))
        assertEquals(CoreUploadRetryPolicy.BASE_DELAY_MS, CoreUploadRetryPolicy.delayMs(0))
        assertEquals(CoreUploadRetryPolicy.MAX_DELAY_MS, CoreUploadRetryPolicy.delayMs(100))
    }
}
