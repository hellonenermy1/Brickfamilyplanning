package com.brick.safety.evidence

import android.content.Context
import android.os.SystemClock
import android.test.InstrumentationTestCase
import java.util.UUID

@Suppress("DEPRECATION")
class Phase2PairingGuardInstrumentedTest : InstrumentationTestCase() {
    companion object {
        private const val TEST_DEVICE_ID = "12345678-1234-4678-9abc-def012345678"
        private const val SECOND_DEVICE_ID = "87654321-4321-4abc-8def-0123456789ab"
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

    private fun dispatcher(journal: EvidenceJournal, failIfTransportRuns: Boolean = false) = EvidenceDispatcher(
        context,
        journal,
        EvidenceTransport { _, _, _ ->
            if (failIfTransportRuns) error("transport must not run for invalid identity") else emptyList()
        },
        { false },
        false
    )

    fun testUnpairedInstallationDoesNotPersistEvidence() {
        val journal = EvidenceJournal(context, TestCipher)
        val dispatcher = dispatcher(journal, failIfTransportRuns = true)
        assertFalse(dispatcher.enqueue(observation()))
        assertEquals(0, dispatcher.stats().pendingCount)
        dispatcher.close()
    }

    fun testPairingRequiresBothCanonicalV4DeviceIdAndApiBase() {
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

    private fun assertInvalidDeviceIdRejected(value: String) {
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertTrue(
            prefs.edit()
                .clear()
                .putString("deviceId", value)
                .putString("apiBase", "https://brick.invalid")
                .commit()
        )
        val journal = EvidenceJournal(context, TestCipher)
        val dispatcher = dispatcher(journal, failIfTransportRuns = true)
        assertFalse(dispatcher.enqueue(observation()))
        assertEquals(0, dispatcher.stats().pendingCount)
        assertEquals(0, dispatcher.drainIfSafe())
        dispatcher.close()
    }

    fun testCorruptOrNonV4DeviceIdCannotPersistOrDrainEvidence() {
        assertInvalidDeviceIdRejected("../../victim")
        // Canonical UUID text but version 5; pairing only creates RFC-4122 v4 IDs.
        assertInvalidDeviceIdRejected("12345678-1234-5678-9abc-def012345678")
    }

    private fun assertInvalidApiBaseRejected(value: String) {
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertTrue(
            prefs.edit()
                .clear()
                .putString("deviceId", TEST_DEVICE_ID)
                .putString("apiBase", value)
                .commit()
        )
        val journal = EvidenceJournal(context, TestCipher)
        val dispatcher = dispatcher(journal, failIfTransportRuns = true)
        assertFalse(dispatcher.enqueue(observation()))
        assertEquals(0, dispatcher.stats().pendingCount)
        assertEquals(EvidenceDrainStop.IDENTITY_UNAVAILABLE, dispatcher.drainDetailed().stop)
        dispatcher.close()
    }

    fun testCorruptApiOriginCannotCreateUnsendableEvidenceBacklog() {
        assertInvalidApiBaseRejected("http://brick.invalid")
        assertInvalidApiBaseRejected("https://user@brick.invalid")
        assertInvalidApiBaseRejected("https://brick.invalid/path")
        assertInvalidApiBaseRejected("https://brick.invalid/?q=1")
        assertInvalidApiBaseRejected("not-a-url")
    }

    fun testPairingChangeQuarantinesOldPendingEvidenceBeforeNewIdentityCanUpload() {
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertTrue(
            prefs.edit()
                .putInt("epoch", 91)
                .putString("deviceId", TEST_DEVICE_ID)
                .putString("apiBase", "https://brick.invalid")
                .commit()
        )

        var journal = EvidenceJournal(context, TestCipher)
        var dispatcher = EvidenceDispatcher(
            context,
            journal,
            EvidenceTransport { _, _, _ -> error("network must not run while creating old backlog") },
            { false },
            false
        )
        assertTrue(dispatcher.enqueue(observation()))
        assertEquals(1, dispatcher.stats().pendingCount)
        dispatcher.close()

        // Simulate an authorised re-pair to a different Brick child identity while old evidence is
        // still offline. The old record must never be uploaded under SECOND_DEVICE_ID.
        assertTrue(prefs.edit().putString("deviceId", SECOND_DEVICE_ID).commit())
        var transportCalls = 0
        journal = EvidenceJournal(context, TestCipher)
        dispatcher = EvidenceDispatcher(
            context,
            journal,
            EvidenceTransport { _, _, _ -> transportCalls += 1; error("old evidence must not upload under new identity") },
            { false },
            false
        )
        val afterRebind = dispatcher.drainDetailed(maxBatches = 1)
        assertEquals(EvidenceDrainStop.EMPTY, afterRebind.stop)
        assertEquals(0, afterRebind.sentRecords)
        assertEquals(0, transportCalls)
        assertEquals(0, dispatcher.stats().pendingCount)
        assertEquals(1, dispatcher.stats().quarantinedCount)
        dispatcher.close()

        // Fresh evidence for the new identity can continue automatically without manual DB cleanup.
        journal = EvidenceJournal(context, TestCipher)
        dispatcher = EvidenceDispatcher(
            context,
            journal,
            EvidenceTransport { _, deviceId, batch ->
                transportCalls += 1
                assertEquals(SECOND_DEVICE_ID, deviceId)
                EvidenceProtocol.decodeBatch(batch.bytes).records.map {
                    EvidenceAck(it.epoch, it.sequence, it.observation.recordId)
                }
            },
            { false },
            false
        )
        assertTrue(dispatcher.enqueue(observation()))
        val newIdentityDrain = dispatcher.drainDetailed(maxBatches = 1)
        assertEquals(1, newIdentityDrain.sentRecords)
        assertEquals(1, transportCalls)
        assertEquals(0, dispatcher.stats().pendingCount)
        assertEquals(1, dispatcher.stats().quarantinedCount)
        assertEquals(1L, prefs.getLong("evidenceIdentityQuarantinedRecordsTotal", 0L))
        dispatcher.close()
    }
}
