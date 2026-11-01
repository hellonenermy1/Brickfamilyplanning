package com.brick.safety.fusion

import com.brick.safety.atlas.AtlasRuntimeSnapshot
import com.brick.safety.location.Phase3FallbackEstimate
import com.brick.safety.location.PositionQuality
import com.brick.safety.location.PositionSource

data class Phase5FusionSelection(
    val result: FusionResult,
    val speedMps: Float?,
    val bearingDeg: Float?,
    val stepDelta: Int,
    val source: PositionSource
)

class Phase5PositionFusion(private val engine: ParallelEvidenceEngine = ParallelEvidenceEngine()) {
    fun select(
        nowElapsedMs: Long,
        phase3: Phase3FallbackEstimate?,
        atlas: AtlasRuntimeSnapshot?,
        anchor: Phase5AnchorInput?,
        lastKnown: Phase5LastKnownInput?,
        learnedPlace: FusionConstraint? = null
    ): Phase5FusionSelection? {
        val constraints = ArrayList<FusionConstraint>(5)
        Phase5FusionAdapter.fromPhase3(phase3, nowElapsedMs)?.let(constraints::add)
        // Generic Atlas and a named learned-place interpretation deliberately share
        // `atlas.environment`; the central engine keeps only the strongest interpretation so a
        // single environmental observation cannot vote twice.
        Phase5FusionAdapter.fromAtlas(atlas, nowElapsedMs)?.let(constraints::add)
        learnedPlace?.let(constraints::add)
        Phase5FusionAdapter.fromAnchor(anchor, nowElapsedMs)?.let(constraints::add)
        Phase5FusionAdapter.fromLastKnown(lastKnown, nowElapsedMs)?.let(constraints::add)
        if (constraints.isEmpty()) return null

        val result = engine.fuse(nowElapsedMs, constraints)
        if (!result.hasPosition || result.state == PositionQuality.UNKNOWN) return null
        val usedKinds = result.evidenceUsed.mapTo(linkedSetOf()) { it.kind }
        val source = when {
            usedKinds.size > 1 -> PositionSource.FUSION
            usedKinds.any { it == FusionEvidenceKind.ATLAS || it == FusionEvidenceKind.LEARNED_PLACE || it == FusionEvidenceKind.RADIO_ROUTE || it == FusionEvidenceKind.WIFI_SEMANTIC || it == FusionEvidenceKind.WIFI_RTT || it == FusionEvidenceKind.WITNESS || it == FusionEvidenceKind.GROUND_RECEIVER || it == FusionEvidenceKind.FUTURE_RANGING } -> PositionSource.FUSION
            usedKinds.singleOrNull() == FusionEvidenceKind.BLE_ANCHOR -> PositionSource.BLE_ANCHOR
            usedKinds.singleOrNull() == FusionEvidenceKind.LAST_KNOWN -> PositionSource.LAST_KNOWN
            else -> PositionSource.INERTIAL
        }
        return Phase5FusionSelection(
            result = result,
            speedMps = phase3?.position?.speedMps?.takeIf { it.isFinite() && it >= 0f },
            bearingDeg = phase3?.position?.headingDeg?.takeIf { it.isFinite() },
            stepDelta = phase3?.stepDelta ?: 0,
            source = source
        )
    }
}
