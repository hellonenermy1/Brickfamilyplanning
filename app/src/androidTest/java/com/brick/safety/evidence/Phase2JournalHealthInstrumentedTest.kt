package com.brick.safety.evidence

import android.content.Context
import android.os.SystemClock
import android.test.InstrumentationTestCase
import java.util.UUID

@Suppress("DEPRECATION")
class Phase2JournalHealthInstrumentedTest : InstrumentationTestCase() {
    companion object {
        private const val TEST_DEVICE_ID = "12345678-1234-4678-9abc-def012345678"
    }

    private lateinit var context: Context

    private object TestCipher : EvidenceCipher {
        override fun encrypt(plain: ByteArray): ByteArray = byteArrayOf(0x44) + plain
        override fun decrypt(blob: ByteArray): ByteArray {
            require(blob.isNotEmpty() && blob[0] == 0x44.toByte())
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

    private fun observation() = EvidenceObservation(
        recordId = UUID.randomUUID().toString(),
        elapsedRealtimeMs = SystemClock.elapsedRealtime(),
        wallTimeMs = System.currentTimeMillis(),
        provider = EvidenceProviderId.DUMMY_TEST,
        family = EvidenceFamily.DUMMY_TEST,
        independenceGroup = "dummy:test:health",
        capability = ProviderCapability.SUPPORTED,
        health = ProviderHealth.HEALTHY,
        quality = EvidenceQuality.HIGH,
        payload = "health-probe".toByteArray(Charsets.UTF_8)
    )

    fun testQuietReadableJournalRecoversAfterFailureHoldWithoutDroppingQuarantineHistory() {
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val journal = EvidenceJournal(context, TestCipher)
        val record = journal.appendNew(TEST_DEVICE_ID, 81, observation())
        assertNotNull(record)

        val rawDb = context.openOrCreateDatabase(EvidenceJournal.DATABASE_NAME, Context.MODE_PRIVATE, null)
        rawDb.execSQL(
            "UPDATE evidence SET payload=? WHERE record_id=?",
            arrayOf(byteArrayOf(0x00), requireNotNull(record).observation.recordId)
        )
        rawDb.close()

        assertTrue(journal.nextPending().isEmpty())
        assertEquals(1, journal.stats().quarantinedCount)
        assertFalse(prefs.getBoolean("evidenceJournalHealthy", true))

        // No append/ACK follows. Once the existing hold period is old, a successful read probe is
        // enough to prove that the journal itself recovered while retaining quarantine history.
        assertTrue(
            prefs.edit()
                .putLong("lastEvidenceJournalFailureWallMs", System.currentTimeMillis() - 180_000L)
                .commit()
        )
        assertTrue(journal.refreshHealth())
        assertTrue(prefs.getBoolean("evidenceJournalHealthy", false))
        assertEquals(1, journal.stats().quarantinedCount)
        assertEquals(0, journal.stats().pendingCount)
        journal.close()
    }
}
