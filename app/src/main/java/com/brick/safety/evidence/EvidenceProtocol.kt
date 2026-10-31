package com.brick.safety.evidence

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

object EvidenceProtocol {
    private const val MAGIC = 0x42524556 // BREV
    const val VERSION: Byte = 1
    const val MAX_RECORDS_PER_BATCH = 24
    const val MAX_RECORD_PAYLOAD_BYTES = 2_048
    const val MAX_INDEPENDENCE_GROUP_BYTES = 64
    const val MAX_BATCH_BYTES = 65_536
    const val MAX_WIRE_INTEGER = 9_007_199_254_740_991L // JavaScript Number.MAX_SAFE_INTEGER
    private const val BATCH_HEADER_BYTES = 4 + 1 + 16 + 2
    private const val RECORD_FIXED_BYTES = 16 + 4 + 8 + 8 + 8 + 5 + 1 + 2

    data class EncodedBatch(
        val batchId: String,
        val records: List<EvidenceRecord>,
        val bytes: ByteArray
    )

    data class DecodedBatch(val batchId: String, val records: List<EvidenceRecord>)

    fun encodeRecord(record: EvidenceRecord): ByteArray {
        val group = record.observation.independenceGroup.toByteArray(Charsets.UTF_8)
        require(group.size in 1..MAX_INDEPENDENCE_GROUP_BYTES)
        require(record.observation.payload.size <= MAX_RECORD_PAYLOAD_BYTES)
        val out = ByteBuffer.allocate(RECORD_FIXED_BYTES + group.size + record.observation.payload.size).order(ByteOrder.BIG_ENDIAN)
        putUuid(out, record.observation.recordId)
        out.putInt(record.epoch)
        out.putLong(record.sequence)
        out.putLong(record.observation.elapsedRealtimeMs)
        out.putLong(record.observation.wallTimeMs)
        out.put(record.observation.provider.code.toByte())
        out.put(record.observation.family.code.toByte())
        out.put(record.observation.capability.code.toByte())
        out.put(record.observation.health.code.toByte())
        out.put(record.observation.quality.code.toByte())
        out.put(group.size.toByte())
        out.putShort(record.observation.payload.size.toShort())
        out.put(group)
        out.put(record.observation.payload)
        return out.array()
    }

    fun decodeRecord(bytes: ByteArray): EvidenceRecord {
        val b = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)
        val record = readRecord(b)
        require(!b.hasRemaining()) { "trailing bytes in evidence record" }
        return record
    }

    fun encodeBatch(records: List<EvidenceRecord>, batchId: String = UUID.randomUUID().toString()): EncodedBatch {
        require(records.isNotEmpty() && records.size <= MAX_RECORDS_PER_BATCH)
        val parsedBatchId = runCatching { UUID.fromString(batchId) }.getOrNull()
        require(parsedBatchId != null && parsedBatchId.toString() == batchId) { "batchId must be canonical lowercase UUID" }
        validateOrder(records)
        require(records.map { it.observation.recordId }.toSet().size == records.size) { "duplicate evidence recordId" }
        val bodies = records.map(::encodeRecord)
        val total = BATCH_HEADER_BYTES + bodies.sumOf { it.size }
        require(total <= MAX_BATCH_BYTES) { "evidence batch too large" }
        val out = ByteBuffer.allocate(total).order(ByteOrder.BIG_ENDIAN)
        out.putInt(MAGIC)
        out.put(VERSION)
        putUuid(out, batchId)
        out.putShort(records.size.toShort())
        bodies.forEach(out::put)
        return EncodedBatch(batchId, records.toList(), out.array())
    }

    fun decodeBatch(bytes: ByteArray): DecodedBatch {
        require(bytes.size in BATCH_HEADER_BYTES..MAX_BATCH_BYTES) { "invalid evidence batch size" }
        val b = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)
        require(b.int == MAGIC) { "invalid evidence magic" }
        require(b.get() == VERSION) { "unsupported evidence protocol" }
        val batchId = readUuid(b)
        val count = b.short.toInt() and 0xffff
        require(count in 1..MAX_RECORDS_PER_BATCH) { "invalid evidence record count" }
        val records = ArrayList<EvidenceRecord>(count)
        repeat(count) { records += readRecord(b) }
        require(!b.hasRemaining()) { "trailing bytes in evidence batch" }
        validateOrder(records)
        require(records.map { it.observation.recordId }.toSet().size == records.size) { "duplicate evidence recordId" }
        return DecodedBatch(batchId, records)
    }

    private fun readRecord(b: ByteBuffer): EvidenceRecord {
        require(b.remaining() >= RECORD_FIXED_BYTES) { "truncated evidence record" }
        val recordId = readUuid(b)
        val epoch = b.int
        val sequence = b.long
        val elapsed = b.long
        val wall = b.long
        val provider = EvidenceProviderId.fromCode(b.get().toInt() and 0xff) ?: error("unknown evidence provider")
        val family = EvidenceFamily.fromCode(b.get().toInt() and 0xff) ?: error("unknown evidence family")
        val capability = ProviderCapability.fromCode(b.get().toInt() and 0xff) ?: error("unknown provider capability")
        val health = ProviderHealth.fromCode(b.get().toInt() and 0xff) ?: error("unknown provider health")
        val quality = EvidenceQuality.fromCode(b.get().toInt() and 0xff) ?: error("unknown evidence quality")
        val groupLength = b.get().toInt() and 0xff
        val payloadLength = b.short.toInt() and 0xffff
        require(groupLength in 1..MAX_INDEPENDENCE_GROUP_BYTES) { "invalid independence group length" }
        require(payloadLength <= MAX_RECORD_PAYLOAD_BYTES) { "evidence payload too large" }
        require(b.remaining() >= groupLength + payloadLength) { "truncated evidence body" }
        val groupBytes = ByteArray(groupLength).also(b::get)
        val payload = ByteArray(payloadLength).also(b::get)
        val group = groupBytes.toString(Charsets.UTF_8)
        return EvidenceRecord(
            epoch = epoch,
            sequence = sequence,
            observation = EvidenceObservation(
                recordId = recordId,
                elapsedRealtimeMs = elapsed,
                wallTimeMs = wall,
                provider = provider,
                family = family,
                independenceGroup = group,
                capability = capability,
                health = health,
                quality = quality,
                payload = payload
            )
        )
    }

    private fun validateOrder(records: List<EvidenceRecord>) {
        records.zipWithNext().forEach { (a, b) ->
            require(b.epoch > a.epoch || (b.epoch == a.epoch && b.sequence > a.sequence)) {
                "evidence records must be strictly ordered"
            }
        }
    }

    private fun putUuid(buffer: ByteBuffer, value: String) {
        val uuid = UUID.fromString(value)
        buffer.putLong(uuid.mostSignificantBits)
        buffer.putLong(uuid.leastSignificantBits)
    }

    private fun readUuid(buffer: ByteBuffer): String = UUID(buffer.long, buffer.long).toString()
}
