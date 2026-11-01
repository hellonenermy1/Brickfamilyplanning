package com.brick.safety.fusion

import com.brick.safety.atlas.AtlasRuntimeSnapshot
import com.brick.safety.location.Phase3FallbackEstimate
import com.brick.safety.location.PositionQuality
import com.brick.safety.location.PositionSource

data class Phase5StoredHypothesis(
    val id: String,
    val latitude: Double,
    val longitude: Double,
    val uncertaintyM: Float,
    /** Internal relative ordering weight, never a calibrated probability. */
    val realtimeWeight: Double,
    /** Retained evidence ordering weight for later endpoint reranking. */
    val storedEvidenceWeight: Double,
    val source: String
)

data class Phase5FusionSelection(
    val result: FusionResult,
    val speedMps: Float?,
    val bearingDeg: Float?,
    val stepDelta: Int,
    val source: PositionSource,
    val originalRealtimeHypothesisId: String,
    val storedHypotheses: List<Phase5StoredHypothesis>
)

class Phase5PositionFusion(private val engine: ParallelEvidenceEngine = ParallelEvidenceEngine()) {
    fun select(
        nowElapsedMs: Long,
        phase3: Phase3FallbackEstimate?,
        atlas: AtlasRuntimeSnapshot?,
        anchor: Phase5AnchorInput?,
        lastKnown: Phase5LastKnownInput?,
        learnedPlace: FusionConstraint? = null,
        coarseNetwork: FusionConstraint? = null
    ): Phase5FusionSelection? {
        val constraints = ArrayList<FusionConstraint>(6)
        Phase5FusionAdapter.fromPhase3(phase3, nowElapsedMs)?.let(constraints::add)
        // Generic Atlas and a named learned-place interpretation deliberately share
        // `atlas.environment`; the central engine keeps only the strongest interpretation so a
        // single environmental observation cannot vote twice.
        Phase5FusionAdapter.fromAtlas(atlas, nowElapsedMs)?.let(constraints::add)
        val effectiveLearnedPlace = learnedPlace ?: Phase5LearnedPlaceRuntime.constraint(atlas, nowElapsedMs)
        effectiveLearnedPlace?.let(constraints::add)
        Phase5FusionAdapter.fromAnchor(anchor, nowElapsedMs)?.let(constraints::add)
        Phase5FusionAdapter.fromLastKnown(lastKnown, nowElapsedMs)?.let(constraints::add)
        // IP-derived location is a last-resort coarse area. The runtime enforces a 50 km radius and
        // COARSE state on-device, so it cannot become building/place truth even if server metadata
        // is unexpectedly precise.
        val effectiveCoarseNetwork = coarseNetwork ?: Phase5CoarseNetworkRuntime.constraint(nowElapsedMs)
        effectiveCoarseNetwork?.let(constraints::add)
        if (constraints.isEmpty()) return null

        val result = engine.fuse(nowElapsedMs, constraints)
        if (!result.hasPosition || result.state == PositionQuality.UNKNOWN) return null
        val usedKinds = result.evidenceUsed.mapTo(linkedSetOf()) { it.kind }
        val source = when {
            usedKinds.size > 1 -> PositionSource.FUSION
            usedKinds.any { it == FusionEvidenceKind.ATLAS || it == FusionEvidenceKind.LEARNED_PLACE || it == FusionEvidenceKind.RADIO_ROUTE || it == FusionEvidenceKind.WIFI_SEMANTIC || it == FusionEvidenceKind.WIFI_RTT || it == FusionEvidenceKind.WITNESS || it == FusionEvidenceKind.GROUND_RECEIVER || it == FusionEvidenceKind.FUTURE_RANGING || it == FusionEvidenceKind.COARSE_NETWORK } -> PositionSource.FUSION
            usedKinds.singleOrNull() == FusionEvidenceKind.BLE_ANCHOR -> PositionSource.BLE_ANCHOR
            usedKinds.singleOrNull() == FusionEvidenceKind.LAST_KNOWN -> PositionSource.LAST_KNOWN
            else -> PositionSource.INERTIAL
        }
        val usedIds = result.evidenceUsed.mapTo(hashSetOf()) { it.id }
        val hypotheses = ArrayList<Phase5StoredHypothesis>(1 + usedIds.size)
        hypotheses += Phase5StoredHypothesis(
            id = "realtime",
            latitude = result.latitude!!,
            longitude = result.longitude!!,
            uncertaintyM = result.uncertaintyM,
            realtimeWeight = 1.0,
            storedEvidenceWeight = 1.0,
            source = "realtime_fusion"
        )
        constraints.asSequence()
            .filter { it.id in usedIds }
            .take(12)
            .forEach { c ->
                hypotheses += Phase5StoredHypothesis(
                    id = "c:${c.id}",
                    latitude = c.latitude,
                    longitude = c.longitude,
                    uncertaintyM = c.radiusM,
                    realtimeWeight = (c.supportWeight * c.strength.multiplier).coerceIn(0.0, 1.0),
                    storedEvidenceWeight = c.supportWeight.coerceIn(0.0, 1.0),
                    source = c.kind.name.lowercase()
                )
            }

        return Phase5FusionSelection(
            result = result,
            speedMps = phase3?.position?.speedMps?.takeIf { it.isFinite() && it >= 0f },
            bearingDeg = phase3?.position?.headingDeg?.takeIf { it.isFinite() },
            stepDelta = phase3?.stepDelta ?: 0,
            source = source,
            originalRealtimeHypothesisId = "realtime",
            storedHypotheses = hypotheses
        )
    }
}
