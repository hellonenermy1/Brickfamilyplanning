package com.brick.safety.evidence

import android.content.Context
import android.os.SystemClock
import android.test.InstrumentationTestCase
import java.util.UUID

@Suppress("DEPRECATION")
class Phase2PairingGuardInstrumentedTest : InstrumentationTestCase() {
    companion object {
        private const val TEST_DEVICE_ID = "12345678-1234-4678-9abc-def012345678"
    }

    private lateinit var context: Context

    private object TestCipher : EvidenceCipher {
        override fun encrypt(plain: ByteArray): ByteArray = byteArrayOf(0x55) + plain
        override fun decrypt(blob: ByteArray): ByteArray {
            require(blob.isNotEmpty() && blob[0] == 0x55.toByte())
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
        independenceGroup = "dummy:test:pairing",
        capability = ProviderCapability.SUPPORTED,
        health = ProviderHealth.HEALTHY,
        quality = EvidenceQuality.HIGH,
        payload = "unpaired-must-not-persist".toByteArray(Charsets.UTF_8)
    )

    private fun dispatcher(journal: EvidenceJournal) = EvidenceDispatcher(
        context,
        journal,
        EvidenceTransport { _, _, _ -> emptyList() },
        { false },
        false
    )

    fun testUnpairedInstallationDoesNotPersistEvidence() {
        val journal = EvidenceJournal(context, TestCipher)
        val dispatcher = EvidenceDispatcher(
            context = context,
            journal = journal,
            transport = EvidenceTransport { _, _, _ -> error("transport must not run") },
            coreBacklogProbe = { false },
            scheduleRecovery = false
        )

        assertFalse(dispatcher.enqueue(observation()))
        assertEquals(0, dispatcher.stats().pendingCount)
        dispatcher.close()
    }

    fun testPairingRequiresBothCanonicalDeviceIdAndApiBase() {
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertTrue(prefs.edit().putString("deviceId", TEST_DEVICE_ID).commit())

        var journal = EvidenceJournal(context, TestCipher)
        var dispatcher = dispatcher(journal)
        assertFalse(dispatcher.enqueue(observation()))
        assertEquals(0, dispatcher.stats().pendingCount)
        dispatcher.close()

        assertTrue(prefs.edit().putString("apiBase", "https://brick.invalid").commit())
        journal = EvidenceJournal(context, TestCipher)
        dispatcher = dispatcher(journal)
        assertTrue(dispatcher.enqueue(observation()))
        assertEquals(1, dispatcher.stats().pendingCount)
        dispatcher.close()
    }

    fun testCorruptDeviceIdCannotPersistOrDrainEvidence() {
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertTrue(
            prefs.edit()
                .putString("deviceId", "../../victim")
                .putString("apiBase", "https://brick.invalid")
                .commit()
        )

        val journal = EvidenceJournal(context, TestCipher)
        val dispatcher = EvidenceDispatcher(
            context,
            journal,
            EvidenceTransport { _, _, _ -> error("transport must not run for invalid identity") },
            { false },
            false
        )
        assertFalse(dispatcher.enqueue(observation()))
        assertEquals(0, dispatcher.stats().pendingCount)
        assertEquals(0, dispatcher.drainIfSafe())
        dispatcher.close()
    }
}
