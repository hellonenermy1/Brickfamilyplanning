package com.brick.safety.fusion

import com.brick.safety.atlas.AtlasRuntimeSnapshot
import com.brick.safety.location.GeoMath
import com.brick.safety.location.Phase3FallbackEstimate
import com.brick.safety.location.PositionQuality
import kotlin.math.max

data class Phase5AnchorInput(
    val id: String,
    val latitude: Double,
    val longitude: Double,
    val radiusM: Float,
    val observedElapsedMs: Long,
    val maxAgeMs: Long,
    val kind: FusionEvidenceKind,
    val independenceGroup: String,
    val explanation: String
)

data class Phase5LastKnownInput(
    val latitude: Double,
    val longitude: Double,
    val uncertaintyM: Float,
    val observedElapsedMs: Long,
    val maxAgeMs: Long
)

object Phase5FusionAdapter {
    fun fromPhase3(fallback: Phase3FallbackEstimate?, nowElapsedMs: Long): FusionConstraint? {
        val estimate = fallback?.position ?: return null
        if (estimate.expired) return null
        if (!estimate.lat.isFinite() || estimate.lat !in -90.0..90.0 || !estimate.lon.isFinite() || estimate.lon !in -180.0..180.0) return null
        val radius = estimate.uncertaintyM.takeIf { it.isFinite() }?.coerceIn(15f, 10_000f) ?: return null
        val agePenalty = (estimate.ageSinceTrustedMs / (20.0 * 60_000.0)).coerceIn(0.0, 1.0)
        val support = (0.82 - agePenalty * 0.42).coerceIn(0.30, 0.82)
        return FusionConstraint(
            id = "phase3-particle",
            kind = FusionEvidenceKind.MOTION_PARTICLE,
            independenceGroup = "motion.path",
            observedElapsedMs = nowElapsedMs,
            latitude = estimate.lat,
            longitude = estimate.lon,
            radiusM = radius,
            supportWeight = support,
            strength = FusionStrength.MEDIUM,
            upperState = PositionQuality.ESTIMATED,
            maxAgeMs = 20_000L,
            shapeHint = if (estimate.routeConstrained && estimate.routeCandidateIds.isNotEmpty()) FusionShapeKind.CORRIDOR else FusionShapeKind.POSSIBLE_AREA,
            routeCandidateIds = estimate.routeCandidateIds.take(8),
            explanation = if (estimate.routeConstrained) "motion + route hypotheses" else "motion hypotheses"
        )
    }

    fun fromAtlas(snapshot: AtlasRuntimeSnapshot?, nowElapsedMs: Long): FusionConstraint? {
        snapshot ?: return null
        if (snapshot.observedElapsedMs <= 0L || snapshot.observedElapsedMs > nowElapsedMs) return null
        val age = nowElapsedMs - snapshot.observedElapsedMs
        if (age > 45_000L) return null
        val candidates = snapshot.candidates.filter {
            it.latitude.isFinite() && it.latitude in -90.0..90.0 && it.longitude.isFinite() && it.longitude in -180.0..180.0 &&
                it.uncertaintyM.isFinite() && it.uncertaintyM in 1f..5_000f && it.supportWeight.isFinite() && it.supportWeight > 0.0
        }.take(4)
        if (candidates.isEmpty()) return null
        val top = candidates.first()

        // Ambiguous Atlas results are alternative hypotheses, not independent votes. Represent the
        // alternatives as one broad possible area instead of silently picking the most attractive cell.
        if (top.ambiguous && candidates.size >= 2) {
            val weighted = GeoMath.weightedCentroid(candidates.map {
                Triple(it.latitude, it.longitude, it.supportWeight.coerceAtLeast(0.05))
            }) ?: return null
            var radius = 35.0
            for (c in candidates) {
                radius = max(radius, GeoMath.distanceMeters(weighted.first, weighted.second, c.latitude, c.longitude) + c.uncertaintyM)
            }
            return FusionConstraint(
                id = "atlas-ambiguous",
                kind = FusionEvidenceKind.ATLAS,
                independenceGroup = "atlas.environment",
                observedElapsedMs = snapshot.observedElapsedMs,
                latitude = weighted.first,
                longitude = weighted.second,
                radiusM = radius.coerceAtMost(5_000.0).toFloat(),
                supportWeight = top.supportWeight.coerceAtMost(0.45),
                strength = FusionStrength.WEAK,
                upperState = PositionQuality.ESTIMATED,
                maxAgeMs = 45_000L,
                shapeHint = FusionShapeKind.POSSIBLE_AREA,
                explanation = "ambiguous environmental fingerprint area"
            )
        }

        val strong = top.independenceGroups >= 2 && top.matchedSignals >= 2 && top.supportWeight >= 0.65 && top.negativePenalty <= 0.08
        return FusionConstraint(
            id = "atlas-${top.labelId.takeLast(48).replace(Regex("[^A-Za-z0-9._:-]"), "_")}",
            kind = if (strong) FusionEvidenceKind.LEARNED_PLACE else FusionEvidenceKind.ATLAS,
            independenceGroup = "atlas.environment",
            observedElapsedMs = snapshot.observedElapsedMs,
            latitude = top.latitude,
            longitude = top.longitude,
            radiusM = top.uncertaintyM.coerceAtLeast(if (strong) 35f else 60f),
            supportWeight = top.supportWeight.coerceIn(0.05, 0.92),
            strength = if (strong) FusionStrength.STRONG else FusionStrength.MEDIUM,
            upperState = if (strong) PositionQuality.ANCHORED else PositionQuality.ESTIMATED,
            maxAgeMs = 45_000L,
            shapeHint = if (strong) FusionShapeKind.PLACE_AREA else FusionShapeKind.POSSIBLE_AREA,
            explanation = if (strong) "learned environmental place match" else "environmental fingerprint match"
        )
    }

    fun fromAnchor(input: Phase5AnchorInput?, nowElapsedMs: Long): FusionConstraint? {
        input ?: return null
        if (input.observedElapsedMs > nowElapsedMs || nowElapsedMs - input.observedElapsedMs > input.maxAgeMs) return null
        val shape = when (input.kind) {
            FusionEvidenceKind.WITNESS -> FusionShapeKind.WITNESS_AREA
            FusionEvidenceKind.GROUND_RECEIVER -> FusionShapeKind.RECEIVER_AREA
            FusionEvidenceKind.BLE_ANCHOR, FusionEvidenceKind.LEARNED_PLACE -> FusionShapeKind.PLACE_AREA
            else -> FusionShapeKind.POSSIBLE_AREA
        }
        return FusionConstraint(
            id = input.id,
            kind = input.kind,
            independenceGroup = input.independenceGroup,
            observedElapsedMs = input.observedElapsedMs,
            latitude = input.latitude,
            longitude = input.longitude,
            radiusM = input.radiusM.coerceIn(25f, 10_000f),
            supportWeight = 0.95,
            strength = FusionStrength.AUTHORITATIVE_AREA,
            upperState = PositionQuality.ANCHORED,
            maxAgeMs = input.maxAgeMs,
            shapeHint = shape,
            explanation = input.explanation
        )
    }

    fun fromLastKnown(input: Phase5LastKnownInput?, nowElapsedMs: Long): FusionConstraint? {
        input ?: return null
        if (input.observedElapsedMs > nowElapsedMs || nowElapsedMs - input.observedElapsedMs > input.maxAgeMs) return null
        return FusionConstraint(
            id = "last-trusted",
            kind = FusionEvidenceKind.LAST_KNOWN,
            independenceGroup = "trusted.history",
            observedElapsedMs = input.observedElapsedMs,
            latitude = input.latitude,
            longitude = input.longitude,
            radiusM = input.uncertaintyM.coerceIn(20f, 10_000f),
            supportWeight = 0.70,
            strength = FusionStrength.MEDIUM,
            upperState = PositionQuality.LAST_KNOWN,
            maxAgeMs = input.maxAgeMs,
            shapeHint = FusionShapeKind.LAST_KNOWN_AREA,
            explanation = "last verified position with aged uncertainty"
        )
    }
}
