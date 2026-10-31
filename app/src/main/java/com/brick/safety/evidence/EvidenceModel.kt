package com.brick.safety.evidence

import java.util.UUID

enum class EvidenceProviderId(val code: Int) {
    FUSED_LOCATION(1),
    GNSS_QUALITY(2),
    MOTION(3),
    STEPS(4),
    HEADING(5),
    ROUTE_GEOMETRY(6),
    KNOWN_PLACE(7),
    NETWORK_CONTEXT(8),
    CELLULAR(9),
    BLE_ANCHOR(10),
    WIFI_ENVIRONMENT(11),
    BLE_ENVIRONMENT(12),
    LAN_ENVIRONMENT(13),
    MAGNETIC(14),
    PHYSICAL_LANDMARK(15),
    WIFI_RTT(16),
    WITNESS(17),
    GROUND_RECEIVER(18),
    COMPANION(19),
    HISTORICAL_ROUTE(20),
    FUTURE_RANGING(21),
    DUMMY_TEST(255);

    companion object { fun fromCode(code: Int) = entries.firstOrNull { it.code == code } }
}

enum class EvidenceFamily(val code: Int) {
    POSITION(1),
    MOTION(2),
    ROUTE(3),
    PLACE(4),
    NETWORK(5),
    CELLULAR(6),
    WIFI(7),
    BLE(8),
    MAGNETIC(9),
    LANDMARK(10),
    RANGE(11),
    WITNESS(12),
    COMPANION(13),
    DUMMY_TEST(255);

    companion object { fun fromCode(code: Int) = entries.firstOrNull { it.code == code } }
}

enum class ProviderCapability(val code: Int) {
    SUPPORTED(0),
    UNSUPPORTED(1),
    PERMISSION_REQUIRED(2),
    TEMPORARILY_UNAVAILABLE(3);

    companion object { fun fromCode(code: Int) = entries.firstOrNull { it.code == code } }
}

enum class ProviderHealth(val code: Int) {
    HEALTHY(0),
    DEGRADED(1),
    UNAVAILABLE(2),
    FAILED(3);

    companion object { fun fromCode(code: Int) = entries.firstOrNull { it.code == code } }
}

enum class EvidenceQuality(val code: Int) {
    UNKNOWN(0),
    LOW(1),
    MEDIUM(2),
    HIGH(3);

    companion object { fun fromCode(code: Int) = entries.firstOrNull { it.code == code } }
}

enum class EvidenceSamplingClass {
    CONTINUOUS_SENSOR,
    EVENT_SENSOR,
    RADIO_BURST,
    NETWORK_CONTEXT,
    EXTERNAL_OBSERVATION
}

data class EvidenceObservation(
    val recordId: String = UUID.randomUUID().toString(),
    val elapsedRealtimeMs: Long,
    val wallTimeMs: Long,
    val provider: EvidenceProviderId,
    val family: EvidenceFamily,
    val independenceGroup: String,
    val capability: ProviderCapability,
    val health: ProviderHealth,
    val quality: EvidenceQuality,
    val payload: ByteArray
) {
    init {
        require(runCatching { UUID.fromString(recordId) }.isSuccess) { "recordId must be UUID" }
        require(elapsedRealtimeMs >= 0L) { "elapsedRealtimeMs must be non-negative" }
        require(wallTimeMs > 0L) { "wallTimeMs must be positive" }
        require(independenceGroup.matches(Regex("[A-Za-z0-9._:-]{1,64}"))) { "invalid independenceGroup" }
        require(payload.size <= EvidenceProtocol.MAX_RECORD_PAYLOAD_BYTES) { "evidence payload too large" }
    }
}

data class EvidenceRecord(
    val epoch: Int,
    val sequence: Long,
    val observation: EvidenceObservation
) {
    init {
        require(epoch >= 0) { "epoch must be non-negative" }
        require(sequence > 0L) { "sequence must be positive" }
    }
}

data class EvidenceAck(val epoch: Int, val sequence: Long, val recordId: String)
