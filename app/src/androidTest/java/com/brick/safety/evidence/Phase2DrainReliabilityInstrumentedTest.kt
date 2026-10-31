package com.brick.safety.evidence

import android.content.Context
import android.os.SystemClock
import android.test.InstrumentationTestCase
import com.brick.safety.reliability.EvidenceRetryPolicy
import java.util.UUID

@Suppress("DEPRECATION")
class Phase2DrainReliabilityInstrumentedTest : InstrumentationTestCase() {
    companion object {
        private const val TEST_DEVICE_ID = "12345678-1234-4678-9abc-def012345678"
    }

    private lateinit var context: Context

    private object TestCipher : EvidenceCipher {
        override fun encrypt(plain: ByteArray): ByteArray = byteArrayOf(0x63) + plain
        override fun decrypt(blob: ByteArray): ByteArray {
            require(blob.isNotEmpty() && blob[0] == 0x63.toByte())
            return blob.copyOfRange(1, blob.size)
        }
    }

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        context.deleteDatabase(EvidenceJournal.DATABASE_NAME)
        context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit()
            .clear()
            .putInt("epoch", 71)
            .putString("deviceId", TEST_DEVICE_ID)
            .putString("apiBase", "https://brick.invalid")
            .commit()
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
        independenceGroup = "dummy:test:drain",
        capability = ProviderCapability.SUPPORTED,
        health = ProviderHealth.HEALTHY,
        quality = EvidenceQuality.HIGH,
        payload = label.toByteArray(Charsets.UTF_8)
    )

    fun testWrongOrMissingAckNeverDeletesPendingEvidence() {
        var journal = EvidenceJournal(context, TestCipher)
        assertNotNull(journal.appendNew(TEST_DEVICE_ID, 71, observation("ack-boundary")))
        var dispatcher = EvidenceDispatcher(
            context = context,
            journal = journal,
            transport = EvidenceTransport { _, _, _ -> emptyList() },
            coreBacklogProbe = { false },
            scheduleRecovery = false
        )
        var outcome = dispatcher.drainDetailed(maxBatches = 1)
        assertEquals(EvidenceDrainStop.ACK_FAILURE, outcome.stop)
        assertEquals(0, outcome.sentRecords)
        assertEquals(1, dispatcher.stats().pendingCount)
        dispatcher.close()

        journal = EvidenceJournal(context, TestCipher)
        dispatcher = EvidenceDispatcher(
            context = context,
            journal = journal,
            transport = EvidenceTransport { _, _, batch ->
                val record = EvidenceProtocol.decodeBatch(batch.bytes).records.single()
                listOf(EvidenceAck(record.epoch, record.sequence + 1, record.observation.recordId))
            },
            coreBacklogProbe = { false },
            scheduleRecovery = false
        )
        outcome = dispatcher.drainDetailed(maxBatches = 1)
        assertEquals(EvidenceDrainStop.ACK_FAILURE, outcome.stop)
        assertEquals(0, outcome.sentRecords)
        assertEquals(1, dispatcher.stats().pendingCount)
        dispatcher.close()
    }

    fun testTransportAndCoreBacklogHaveDifferentDrainReasons() {
        var journal = EvidenceJournal(context, TestCipher)
        assertNotNull(journal.appendNew(TEST_DEVICE_ID, 71, observation("transport-failure")))
        var dispatcher = EvidenceDispatcher(
            context = context,
            journal = journal,
            transport = EvidenceTransport { _, _, _ -> error("simulated server failure") },
            coreBacklogProbe = { false },
            scheduleRecovery = false
        )
        var outcome = dispatcher.drainDetailed(maxBatches = 1)
        assertEquals(EvidenceDrainStop.TRANSPORT_FAILURE, outcome.stop)
        assertEquals(1, dispatcher.stats().pendingCount)
        dispatcher.close()

        journal = EvidenceJournal(context, TestCipher)
        dispatcher = EvidenceDispatcher(
            context = context,
            journal = journal,
            transport = EvidenceTransport { _, _, _ -> error("must not run while Core backlog exists") },
            coreBacklogProbe = { true },
            scheduleRecovery = false
        )
        outcome = dispatcher.drainDetailed(maxBatches = 1)
        assertEquals(EvidenceDrainStop.CORE_BACKLOG, outcome.stop)
        assertEquals(0, outcome.sentRecords)
        assertEquals(1, dispatcher.stats().pendingCount)
        dispatcher.close()
    }

    fun testServerConflictIsolatesOnlyConflictingRecordAndDoesNotBlockLaterEvidence() {
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val journal = EvidenceJournal(context, TestCipher)
        assertNotNull(journal.appendNew(TEST_DEVICE_ID, 71, observation("good-a")))
        assertNotNull(journal.appendNew(TEST_DEVICE_ID, 71, observation("conflict")))
        assertNotNull(journal.appendNew(TEST_DEVICE_ID, 71, observation("good-b")))

        var calls = 0
        val dispatcher = EvidenceDispatcher(
            context = context,
            journal = journal,
            transport = EvidenceTransport { _, _, batch ->
                calls += 1
                val records = EvidenceProtocol.decodeBatch(batch.bytes).records
                if (records.size > 1) throw EvidenceUploadConflict("simulated batch conflict")
                val record = records.single()
                if (record.observation.payload.toString(Charsets.UTF_8) == "conflict") {
                    throw EvidenceUploadConflict("simulated record conflict")
                }
                listOf(EvidenceAck(record.epoch, record.sequence, record.observation.recordId))
            },
            coreBacklogProbe = { false },
            scheduleRecovery = false
        )

        val outcome = dispatcher.drainDetailed(maxBatches = 1)
        assertEquals(EvidenceDrainStop.BUDGET_EXHAUSTED, outcome.stop)
        assertEquals(2, outcome.sentRecords)
        assertEquals(4, calls) // one failed multi-record batch + three bounded single-record probes
        assertEquals(0, dispatcher.stats().pendingCount)
        assertEquals(1, dispatcher.stats().quarantinedCount)
        assertEquals(1L, prefs.getLong("evidenceServerConflictRecordsTotal", 0L))
        assertTrue(prefs.getLong("lastEvidenceServerConflictWallMs", 0L) > 0L)
        dispatcher.close()
    }

    fun testCoreBacklogDeferralDoesNotAggressivelyPoll() {
        assertTrue(EvidenceRetryPolicy.CORE_BACKLOG_DELAY_SECONDS >= 60L)
        assertTrue(EvidenceRetryPolicy.CATCH_UP_DELAY_SECONDS < EvidenceRetryPolicy.CORE_BACKLOG_DELAY_SECONDS)
    }

    fun testPersistentFailureBackoffIsBounded() {
        assertEquals(30L, EvidenceRetryPolicy.failureDelaySeconds(1))
        assertEquals(60L, EvidenceRetryPolicy.failureDelaySeconds(2))
        assertEquals(120L, EvidenceRetryPolicy.failureDelaySeconds(3))
        assertEquals(240L, EvidenceRetryPolicy.failureDelaySeconds(4))
        assertEquals(480L, EvidenceRetryPolicy.failureDelaySeconds(5))
        assertEquals(900L, EvidenceRetryPolicy.failureDelaySeconds(6))
        assertEquals(900L, EvidenceRetryPolicy.failureDelaySeconds(99))
    }
}
