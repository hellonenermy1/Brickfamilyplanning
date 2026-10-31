package com.brick.safety.evidence

import android.content.Context
import android.os.SystemClock
import android.test.InstrumentationTestCase

@Suppress("DEPRECATION")
class Phase2SequenceInstrumentedTest : InstrumentationTestCase() {
    private lateinit var context: Context

    private class TestCipher : EvidenceCipher {
        override fun encrypt(plain: ByteArray): ByteArray =
            byteArrayOf(0x51.toByte()) + plain.map { (it.toInt() xor 0x33).toByte() }

        override fun decrypt(blob: ByteArray): ByteArray {
            require(blob.isNotEmpty() && blob[0] == 0x51.toByte())
            return blob.copyOfRange(1, blob.size).map { (it.toInt() xor 0x33).toByte() }.toByteArray()
        }
    }

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        context.deleteDatabase(EvidenceJournal.DATABASE_NAME)
        context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit().clear().commit()
    }

    override fun tearDown() {
        context.deleteDatabase(EvidenceJournal.DATABASE_NAME)
        super.tearDown()
    }

    private fun observation(label: String) = EvidenceObservation(
        elapsedRealtimeMs = SystemClock.elapsedRealtime(),
        wallTimeMs = System.currentTimeMillis(),
        provider = EvidenceProviderId.DUMMY_TEST,
        family = EvidenceFamily.DUMMY_TEST,
        independenceGroup = "dummy:sequence:test",
        capability = ProviderCapability.SUPPORTED,
        health = ProviderHealth.HEALTHY,
        quality = EvidenceQuality.HIGH,
        payload = label.toByteArray()
    )

    fun testSequenceContinuesWhenPreferenceCacheIsLost() {
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertTrue(prefs.edit().putInt("epoch", 23).commit())

        EvidenceDispatcher(
            context,
            EvidenceJournal(context, TestCipher()),
            EvidenceTransport { _, _, _ -> error("network not expected") },
            coreBacklogProbe = { false },
            scheduleRecovery = false
        ).use { dispatcher ->
            assertTrue(dispatcher.enqueue(observation("one")))
            assertTrue(dispatcher.enqueue(observation("two")))
        }

        // Simulate the cheap preference cache being missing/stale after a crash. SQLite remains the
        // authoritative sequence allocator and must not reuse 1 or 2.
        assertTrue(prefs.edit().remove("evidenceSequence").commit())

        EvidenceDispatcher(
            context,
            EvidenceJournal(context, TestCipher()),
            EvidenceTransport { _, _, _ -> error("network not expected") },
            coreBacklogProbe = { false },
            scheduleRecovery = false
        ).use { dispatcher ->
            assertTrue(dispatcher.enqueue(observation("three")))
        }

        EvidenceJournal(context, TestCipher()).use { journal ->
            assertEquals(listOf(1L, 2L, 3L), journal.nextPending(10).map { it.record.sequence })
        }
    }

    fun testSeparateJournalHelpersSharePersistentAllocator() {
        val first = EvidenceJournal(context, TestCipher())
        val second = EvidenceJournal(context, TestCipher())
        try {
            assertEquals(1L, first.appendNew(31, observation("first"))?.sequence)
            assertEquals(2L, second.appendNew(31, observation("second"))?.sequence)
            assertEquals(3L, first.appendNew(31, observation("third"))?.sequence)
        } finally {
            first.close()
            second.close()
        }
    }
}
