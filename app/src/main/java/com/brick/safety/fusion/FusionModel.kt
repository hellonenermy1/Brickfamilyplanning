package com.brick.safety.fusion

import com.brick.safety.location.PositionQuality

enum class FusionEvidenceKind {
    MOTION_PARTICLE,
    ROUTE_GEOMETRY,
    ATLAS,
    LEARNED_PLACE,
    RADIO_ROUTE,
    WIFI_SEMANTIC,
    WIFI_RTT,
    BLE_ANCHOR,
    WITNESS,
    GROUND_RECEIVER,
    NETWORK_CONTEXT,
    COARSE_NETWORK,
    LAST_KNOWN,
    FUTURE_RANGING
}

enum class FusionStrength(val multiplier: Double) {
    WEAK(0.55),
    MEDIUM(0.80),
    STRONG(1.00),
    AUTHORITATIVE_AREA(1.15)
}

enum class FusionShapeKind {
    CIRCLE,
    CORRIDOR,
    POSSIBLE_AREA,
    PLACE_AREA,
    WITNESS_AREA,
    RECEIVER_AREA,
    LAST_KNOWN_AREA,
    UNKNOWN
}

enum class FusionConfidenceBand { HIGH, MEDIUM, LOW, VERY_LOW }

data class FusionConstraint(
    val id: String,
    val kind: FusionEvidenceKind,
    val independenceGroup: String,
    val observedElapsedMs: Long,
    val latitude: Double,
    val longitude: Double,
    val radiusM: Float,
    /** Internal relative support only. This is never a calibrated probability. */
    val supportWeight: Double,
    val strength: FusionStrength,
    val upperState: PositionQuality,
    val maxAgeMs: Long,
    val shapeHint: FusionShapeKind = FusionShapeKind.CIRCLE,
    val routeCandidateIds: List<String> = emptyList(),
    val explanation: String
) {
    init {
        require(id.matches(Regex("[A-Za-z0-9._:-]{1,96}"))) { "invalid fusion constraint id" }
        require(independenceGroup.matches(Regex("[A-Za-z0-9._:-]{1,64}"))) { "invalid independence group" }
        require(observedElapsedMs >= 0L)
        require(latitude.isFinite() && latitude in -90.0..90.0)
        require(longitude.isFinite() && longitude in -180.0..180.0)
        require(radiusM.isFinite() && radiusM in 1f..50_000f)
        require(supportWeight.isFinite() && supportWeight in 0.0..1.0)
        require(maxAgeMs in 1_000L..24L * 60L * 60L * 1_000L)
        require(explanation.length in 1..160)
        require(routeCandidateIds.size <= 8)
        require(upperState != PositionQuality.PRECISE && upperState != PositionQuality.ASSISTED) {
            "non-fused evidence cannot independently claim precise/assisted"
        }
    }
}

data class FusionEvidenceUse(
    val id: String,
    val kind: FusionEvidenceKind,
    val independenceGroup: String,
    val ageMs: Long,
    val radiusM: Float,
    val explanation: String
)

data class FusionConflict(
    val firstId: String,
    val secondId: String,
    val separationM: Double,
    val expectedOverlapM: Double,
    val severity: Double
)

data class FusionResult(
    val latitude: Double?,
    val longitude: Double?,
    val uncertaintyM: Float,
    val state: PositionQuality,
    val shape: FusionShapeKind,
    val confidenceBand: FusionConfidenceBand,
    val evidenceUsed: List<FusionEvidenceUse>,
    val conflicts: List<FusionConflict>,
    val independenceGroups: Int,
    val routeCandidateIds: List<String>,
    val computedElapsedMs: Long
) {
    init {
        require(latitude == null || (latitude.isFinite() && latitude in -90.0..90.0))
        require(longitude == null || (longitude.isFinite() && longitude in -180.0..180.0))
        require((latitude == null) == (longitude == null))
        require(uncertaintyM.isFinite() && uncertaintyM in 1f..50_000f)
        require(state != PositionQuality.PRECISE && state != PositionQuality.ASSISTED) {
            "Phase 5 degraded fusion must not manufacture direct-fix states"
        }
        require(independenceGroups >= 0)
        require(computedElapsedMs >= 0L)
    }

    val hasPosition: Boolean get() = latitude != null && longitude != null
}
