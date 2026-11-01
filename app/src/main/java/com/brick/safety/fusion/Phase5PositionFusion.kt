package com.brick.safety.fusion

import com.brick.safety.activity.ActivityMode
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
        coarseNetwork: FusionConstraint? = null,
        activityMode: ActivityMode = ActivityMode.UNKNOWN
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

        // IP geolocation is a *last-resort* area, not another vote. Even a tiny weak numerical
        // weight could drag the centroid kilometres away if a mobile carrier exits in another city.
        // Therefore current motion/Atlas/place/anchor evidence always wins the opportunity to fuse.
        // If none exists, coarse network comes before last-known exactly as the V1 fallback order
        // specifies; last-known is used only when coarse network is unavailable.
        if (constraints.isEmpty()) {
            val effectiveCoarseNetwork = coarseNetwork ?: Phase5CoarseNetworkRuntime.constraint(nowElapsedMs)
            if (effectiveCoarseNetwork != null) {
                constraints += effectiveCoarseNetwork
            } else {
                Phase5FusionAdapter.fromLastKnown(lastKnown, nowElapsedMs)?.let(constraints::add)
            }
        } else {
            // A recent verified position can still provide conservative consistency context while
            // current degraded evidence exists. Coarse IP is deliberately excluded in this branch.
            Phase5FusionAdapter.fromLastKnown(lastKnown, nowElapsedMs)?.let(constraints::add)
        }
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
        val hypotheses = ArrayList<Phase5StoredHypothesis>(6)
        hypotheses += Phase5StoredHypothesis(
            id = "realtime",
            latitude = result.latitude!!,
            longitude = result.longitude!!,
            uncertaintyM = result.uncertaintyM,
            realtimeWeight = 1.0,
            storedEvidenceWeight = 1.0,
            source = "realtime_fusion"
        )
        // Backward smoothing must be able to reconsider a plausible alternative that realtime
        // fusion did not choose. Preserve used constraints first, then the strongest unused
        // alternatives. These are candidates only; correlated evidence still cannot multiply the
        // realtime fusion vote because the central engine has already enforced independence groups.
        constraints.asSequence()
            .distinctBy { it.id }
            .sortedWith(
                compareByDescending<FusionConstraint> { it.id in usedIds }
                    .thenByDescending { it.supportWeight * it.strength.multiplier }
            )
            // The recorder uses compact JSON with a 2 KiB evidence payload cap. Five alternatives
            // plus the realtime selection stays safely bounded even with maximum legal IDs/source.
            .take(5)
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

        val selection = Phase5FusionSelection(
            result = result,
            speedMps = phase3?.position?.speedMps?.takeIf { it.isFinite() && it >= 0f },
            bearingDeg = phase3?.position?.headingDeg?.takeIf { it.isFinite() },
            stepDelta = phase3?.stepDelta ?: 0,
            source = source,
            originalRealtimeHypothesisId = "realtime",
            storedHypotheses = hypotheses
        )
        // Persistence is additive and fail-open. A journal failure cannot remove the fallback result;
        // health telemetry already exposes evidence-journal failures independently.
        Phase5HypothesisRuntime.record(selection, activityMode)
        return selection
    }
}
