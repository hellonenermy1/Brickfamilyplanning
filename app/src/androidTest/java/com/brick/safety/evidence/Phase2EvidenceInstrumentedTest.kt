package com.brick.safety.evidence

import android.content.Context
import android.test.InstrumentationTestCase
import android.os.SystemClock
import java.util.UUID

@Suppress("DEPRECATION")
class Phase2EvidenceInstrumentedTest : InstrumentationTestCase() {
    private lateinit var context: Context

    private class TestCipher : EvidenceCipher {
        override fun encrypt(plain: ByteArray): ByteArray = byteArrayOf(0x42.toByte()) + plain.map { (it.toInt() xor 0x5a).toByte() }
        override fun decrypt(blob: ByteArray): ByteArray {
            require(blob.isNotEmpty() && blob[0] == 0x42.toByte())
            return blob.copyOfRange(1, blob.size).map { (it.toInt() xor 0x5a).toByte() }.toByteArray()
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
