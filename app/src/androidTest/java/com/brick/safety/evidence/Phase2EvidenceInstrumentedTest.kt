package com.brick.safety.evidence

import android.content.Context
import android.os.SystemClock
import android.test.InstrumentationTestCase
import java.util.UUID

@Suppress("DEPRECATION")
class Phase2EvidenceInstrumentedTest : InstrumentationTestCase() {
    private lateinit var context: Context

    private class TestCipher : EvidenceCipher {
        override fun encrypt(plain: ByteArray): ByteArray =
            byteArrayOf(0x42.toByte()) + plain.map { (it.toInt() xor 0x5a).toByte() }

        override fun decrypt(blob: ByteArray): ByteArray {
            require(blob.isNotEmpty() && blob[0] == 0x42.toByte())
            return blob.copyOfRange(1, blob.size).map { (it.toInt() xor 0x5a).toByte() }.toByteArray()
        }
    }

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        context.deleteDatabase(EvidenceJournal.DATABASE_NAME)
        context.deleteDatabase("brick_journal.db")
        context.deleteDatabase("brick_safety.db")
        context.deleteDatabase("brick_crash.db")
        context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit().clear().commit()
    }

    override fun tearDown() {
        context.deleteDatabase(EvidenceJournal.DATABASE_NAME)
        context.deleteDatabase("brick_journal.db")
        context.deleteDatabase("brick_safety.db")
        context.deleteDatabase("brick_crash.db")
        super.tearDown()
    }

    private fun record(sequence: Long = 1L): EvidenceRecord {
        return EvidenceRecord(
            epoch = 7,
            sequence = sequence,
            observation = EvidenceObservation(
                recordId = UUID.randomUUID().toString(),
                elapsedRealtimeMs = SystemClock.elapsedRealtime(),
                wallTimeMs = System.currentTimeMillis(),
                provider = EvidenceProviderId.DUMMY_TEST,
                family = EvidenceFamily.DUMMY_TEST,
                independenceGroup = "dummy:test:scene",
                capability = ProviderCapability.SUPPORTED,
                health = ProviderHealth.HEALTHY,
                quality = EvidenceQuality.HIGH,
                payload = "dummy-evidence-$sequence".toByteArray()
            )
        )
    }

    fun testProtocolRoundTripAndBounds() {
        val records = listOf(record(1), record(2), record(3))
        val encoded = EvidenceProtocol.encodeBatch(records)
        assertTrue(encoded.bytes.size <= EvidenceProtocol.MAX_BATCH_BYTES)
        val decoded = EvidenceProtocol.decodeBatch(encoded.bytes)
        assertEquals(encoded.batchId, decoded.batchId)
        assertEquals(records.map { it.sequence }, decoded.records.map { it.sequence })
        assertEquals(records.map { it.observation.recordId }, decoded.records.map { it.observation.recordId })
        records.zip(decoded.records).forEach { (expected, actual) ->
            assertTrue(expected.observation.payload.contentEquals(actual.observation.payload))
            assertEquals(expected.observation.independenceGroup, actual.observation.independenceGroup)
        }
    }

    fun testEncryptedJournalSurvivesReopenAndExactAck() {
        val cipher = TestCipher()
        val expected = record(11)
        var journal = EvidenceJournal(context, cipher)
        assertTrue(journal.append(expected))
        assertEquals(1, journal.stats().pendingCount)

        val rawDb = context.openOrCreateDatabase(EvidenceJournal.DATABASE_NAME, Context.MODE_PRIVATE, null)
        val encrypted = rawDb.rawQuery("SELECT payload FROM evidence WHERE record_id=?", arrayOf(expected.observation.recordId)).use { c ->
            assertTrue(c.moveToFirst())
            c.getBlob(0)
        }
        rawDb.close()
        assertFalse(encrypted.contentEquals(EvidenceProtocol.encodeRecord(expected)))

        journal.close()
        journal = EvidenceJournal(context, cipher)
        val reopened = journal.nextPending()
        assertEquals(1, reopened.size)
        assertEquals(expected.observation.recordId, reopened.single().record.observation.recordId)
        assertTrue(expected.observation.payload.contentEquals(reopened.single().record.observation.payload))

        val wrong = EvidenceAck(expected.epoch, expected.sequence + 1, expected.observation.recordId)
        assertFalse(journal.ackBatch(listOf(wrong)))
        assertEquals(1, journal.stats().pendingCount)

        val exact = EvidenceAck(expected.epoch, expected.sequence, expected.observation.recordId)
        assertTrue(journal.ackBatch(listOf(exact)))
        assertEquals(0, journal.stats().pendingCount)
        journal.close()

        journal = EvidenceJournal(context, cipher)
        assertTrue(journal.nextPending().isEmpty())
        journal.close()
    }

    fun testDummyProviderSurvivesReopenThenDrainsWithExactAck() {
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertTrue(
            prefs.edit()
                .putInt("epoch", 17)
                .putString("deviceId", "phase2-test-device")
                .putString("apiBase", "https://brick.invalid")
                .commit()
        )

        val cipher = TestCipher()
        var journal = EvidenceJournal(context, cipher)
        val enqueueDispatcher = EvidenceDispatcher(
            context = context,
            journal = journal,
            transport = EvidenceTransport { _, _, _ -> error("network must not be used during enqueue") },
            coreBacklogProbe = { false },
            scheduleRecovery = false
        )
        val provider = Phase2DummyEvidenceProvider()
        provider.start(EvidenceSink(enqueueDispatcher::enqueue))
        provider.applySampling(EvidenceSamplingCoordinator.decision(EvidenceSamplingClass.EVENT_SENSOR, BrickEvidenceState.MOVING))
        assertTrue(provider.emitOnce("persist-before-network"))
        assertEquals(1, journal.stats().pendingCount)
        provider.stop()

        // Simulate process death/restart by closing the DB helper and creating a fresh dispatcher.
        journal.close()
        journal = EvidenceJournal(context, cipher)
        assertEquals(1, journal.stats().pendingCount)

        var transportCalls = 0
        val transport = EvidenceTransport { _, deviceId, batch ->
            transportCalls += 1
            assertEquals("phase2-test-device", deviceId)
            val decoded = EvidenceProtocol.decodeBatch(batch.bytes)
            assertEquals(batch.batchId, decoded.batchId)
            assertEquals(1, decoded.records.size)
            assertEquals("persist-before-network", decoded.records.single().observation.payload.toString(Charsets.UTF_8))
            decoded.records.map { EvidenceAck(it.epoch, it.sequence, it.observation.recordId) }
        }
        val drainDispatcher = EvidenceDispatcher(
            context = context,
            journal = journal,
            transport = transport,
            coreBacklogProbe = { false },
            scheduleRecovery = false
        )
        assertEquals(1, drainDispatcher.drainIfSafe(maxBatches = 1))
        assertEquals(1, transportCalls)
        assertEquals(0, journal.stats().pendingCount)
        journal.close()

        // Reopening after ACK must not resurrect a delivered record.
        journal = EvidenceJournal(context, cipher)
        assertTrue(journal.nextPending().isEmpty())
        journal.close()
    }

    fun testEvidenceNeverDrainsWhileCoreBacklogIsPresent() {
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        assertTrue(
            prefs.edit()
                .putInt("epoch", 18)
                .putString("deviceId", "phase2-test-device")
                .putString("apiBase", "https://brick.invalid")
                .commit()
        )
        val journal = EvidenceJournal(context, TestCipher())
        assertTrue(journal.append(record(21).copy(epoch = 18)))
        var transportCalls = 0
        val dispatcher = EvidenceDispatcher(
            context = context,
            journal = journal,
            transport = EvidenceTransport { _, _, _ -> transportCalls += 1; emptyList() },
            coreBacklogProbe = { true },
            scheduleRecovery = false
        )
        assertEquals(0, dispatcher.drainIfSafe())
        assertEquals(0, transportCalls)
        assertEquals(1, journal.stats().pendingCount)
        journal.close()
    }

    fun testSamplingCoordinatorKeepsRadioBounded() {
        val sos = EvidenceSamplingCoordinator.decision(EvidenceSamplingClass.RADIO_BURST, BrickEvidenceState.SOS)
        val moving = EvidenceSamplingCoordinator.decision(EvidenceSamplingClass.RADIO_BURST, BrickEvidenceState.MOVING)
        val deep = EvidenceSamplingCoordinator.decision(EvidenceSamplingClass.RADIO_BURST, BrickEvidenceState.DEEP_STATIONARY)
        assertTrue(sos.enabled && moving.enabled && deep.enabled)
        assertTrue(requireNotNull(sos.intervalMs) < requireNotNull(moving.intervalMs))
        assertTrue(requireNotNull(moving.intervalMs) < requireNotNull(deep.intervalMs))
        assertTrue(requireNotNull(sos.maxBurstMs) <= 4_000L)
    }
}
