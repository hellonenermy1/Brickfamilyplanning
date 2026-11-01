package com.brick.safety.evidence

import android.content.Context
import android.os.SystemClock
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.util.UUID

@Suppress("DEPRECATION")
class Phase2SequenceAllocatorInstrumentedTest : BrickInstrumentationTestCase() {
    companion object {
        private const val TEST_DEVICE_ID = "12345678-1234-4678-9abc-def012345678"
    }

    private lateinit var context: Context

    private object TestCipher : EvidenceCipher {
        override fun encrypt(plain: ByteArray): ByteArray = byteArrayOf(0x31) + plain
        override fun decrypt(blob: ByteArray): ByteArray {
            require(blob.isNotEmpty() && blob[0] == 0x31.toByte())
            return blob.copyOfRange(1, blob.size)
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
        recordId = UUID.randomUUID().toString(),
        elapsedRealtimeMs = SystemClock.elapsedRealtime(),
        wallTimeMs = System.currentTimeMillis(),
        provider = EvidenceProviderId.DUMMY_TEST,
        family = EvidenceFamily.DUMMY_TEST,
        independenceGroup = "dummy:test:sequence",
        capability = ProviderCapability.SUPPORTED,
        health = ProviderHealth.HEALTHY,
        quality = EvidenceQuality.HIGH,
        payload = label.toByteArray(Charsets.UTF_8)
    )

    fun testJournalOwnsSequenceAcrossReopenAndStalePreference() {
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertTrue(prefs.edit().putInt("epoch", 31).putLong("evidenceSequence", 999L).commit())

        var journal = EvidenceJournal(context, TestCipher)
        val first = journal.appendNew(TEST_DEVICE_ID, 31, observation("first"))
        assertNotNull(first)
        assertEquals(1L, first!!.sequence)
        journal.close()

        // Simulate a lost/stale cache update. The preference must not control future allocation.
        assertTrue(prefs.edit().putLong("evidenceSequence", 0L).commit())
        journal = EvidenceJournal(context, TestCipher)
        val second = journal.appendNew(TEST_DEVICE_ID, 31, observation("second"))
        assertNotNull(second)
        assertEquals(2L, second!!.sequence)
        journal.close()

        // A separate helper instance must continue from the same durable DB-owned allocator.
        journal = EvidenceJournal(context, TestCipher)
        val third = journal.appendNew(TEST_DEVICE_ID, 31, observation("third"))
        assertNotNull(third)
        assertEquals(3L, third!!.sequence)
        assertEquals(3L, journal.maxSequence(31))
        journal.close()
    }
}
