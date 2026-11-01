package com.brick.safety.evidence

import android.os.SystemClock
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.util.UUID

@Suppress("DEPRECATION")
class Phase2EvidenceApiInstrumentedTest : BrickInstrumentationTestCase() {
    private fun record() = EvidenceRecord(
        epoch = 7,
        sequence = 42L,
        observation = EvidenceObservation(
            recordId = UUID.randomUUID().toString(),
            elapsedRealtimeMs = SystemClock.elapsedRealtime(),
            wallTimeMs = System.currentTimeMillis(),
            provider = EvidenceProviderId.DUMMY_TEST,
            family = EvidenceFamily.DUMMY_TEST,
            independenceGroup = "dummy:test:ack-json",
            capability = ProviderCapability.SUPPORTED,
            health = ProviderHealth.HEALTHY,
            quality = EvidenceQuality.HIGH,
            payload = "strict-ack".toByteArray(Charsets.UTF_8)
        )
    )

    private fun response(batch: EvidenceProtocol.EncodedBatch, protocol: String = "1", epoch: String = "7", sequence: String = "42"): String {
        val recordId = batch.records.single().observation.recordId
        return "{\"protocol\":$protocol,\"batchId\":\"${batch.batchId}\",\"acked\":[{\"epoch\":$epoch,\"sequence\":$sequence,\"recordId\":\"$recordId\"}]}"
    }

    fun testExactIntegralAckParses() {
        val batch = EvidenceProtocol.encodeBatch(listOf(record()))
        val parsed = EvidenceApi.parseAckResponse(response(batch), batch)
        assertEquals(1, parsed.size)
        assertEquals(batch.records.single().epoch, parsed.single().epoch)
        assertEquals(batch.records.single().sequence, parsed.single().sequence)
        assertEquals(batch.records.single().observation.recordId, parsed.single().recordId)
    }

    fun testStringOrFractionalAckNumbersCannotAuthorizeDeletion() {
        val batch = EvidenceProtocol.encodeBatch(listOf(record()))
        assertTrue(runCatching { EvidenceApi.parseAckResponse(response(batch, protocol = "\"1\""), batch) }.isFailure)
        assertTrue(runCatching { EvidenceApi.parseAckResponse(response(batch, epoch = "\"7\""), batch) }.isFailure)
        assertTrue(runCatching { EvidenceApi.parseAckResponse(response(batch, epoch = "7.9"), batch) }.isFailure)
        assertTrue(runCatching { EvidenceApi.parseAckResponse(response(batch, sequence = "\"42\""), batch) }.isFailure)
        assertTrue(runCatching { EvidenceApi.parseAckResponse(response(batch, sequence = "42.9"), batch) }.isFailure)
    }

    fun testOutOfRangeAckNumbersCannotAuthorizeDeletion() {
        val batch = EvidenceProtocol.encodeBatch(listOf(record()))
        assertTrue(runCatching { EvidenceApi.parseAckResponse(response(batch, epoch = "-1"), batch) }.isFailure)
        assertTrue(runCatching { EvidenceApi.parseAckResponse(response(batch, sequence = "0"), batch) }.isFailure)
        assertTrue(
            runCatching {
                EvidenceApi.parseAckResponse(response(batch, sequence = "9007199254740992"), batch)
            }.isFailure
        )
    }
}
