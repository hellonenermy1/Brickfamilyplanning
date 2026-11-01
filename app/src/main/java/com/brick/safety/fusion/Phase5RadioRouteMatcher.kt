package com.brick.safety.fusion

import com.brick.safety.atlas.AtlasRuntimeSnapshot
import com.brick.safety.location.GeoMath
import com.brick.safety.location.LocalRouteSegment
import com.brick.safety.location.Phase3FallbackEstimate
import com.brick.safety.location.RouteSegmentSource
import kotlin.math.exp
import kotlin.math.max

/**
 * Conservative environmental reranking for Phase 3 route hypotheses.
 *
 * This helper deliberately changes only route-candidate ordering. It never changes the Phase 3
 * coordinate, uncertainty, speed, heading or route-constrained flag, and it never adds a second
 * Atlas vote to numerical fusion. A fresh distinctive environmental match may therefore help say
 * "route B is more plausible than route A" without pretending the radios measured an exact point.
 */
object Phase5RadioRouteMatcher {
    private const val MAX_ATLAS_AGE_MS = 45_000L
    private const val MIN_SUPPORT = 0.45
    private const val MAX_NEGATIVE_PENALTY = 0.12

    fun rerank(
        phase3: Phase3FallbackEstimate?,
        atlas: AtlasRuntimeSnapshot?,
        nowElapsedMs: Long
    ): Phase3FallbackEstimate? {
        phase3 ?: return null
        val originalIds = phase3.position.routeCandidateIds
        if (originalIds.size < 2 || phase3.routeHypotheses.isEmpty()) return phase3
        atlas ?: return phase3
        if (atlas.observedElapsedMs !in 1..nowElapsedMs || nowElapsedMs - atlas.observedElapsedMs > MAX_ATLAS_AGE_MS) return phase3

        val environmental = atlas.candidates.asSequence()
            .filter { candidate ->
                !candidate.ambiguous &&
                    candidate.latitude.isFinite() && candidate.latitude in -90.0..90.0 &&
                    candidate.longitude.isFinite() && candidate.longitude in -180.0..180.0 &&
                    candidate.uncertaintyM.isFinite() && candidate.uncertaintyM in 1f..5_000f &&
                    candidate.supportWeight.isFinite() && candidate.supportWeight >= MIN_SUPPORT &&
                    candidate.independenceGroups >= 2 && candidate.matchedSignals >= 2 &&
                    candidate.negativePenalty.isFinite() && candidate.negativePenalty <= MAX_NEGATIVE_PENALTY
            }
            .take(4)
            .toList()
        if (environmental.isEmpty()) return phase3

        val geometry = phase3.routeHypotheses.associateBy { it.id }
        if (originalIds.any { it !in geometry }) return phase3

        data class Ranked(val id: String, val environment: Double, val originalPrior: Double, val historyTie: Double)
        val ranked = originalIds.mapIndexed { index, id ->
            val segment = geometry.getValue(id)
            val environmentScore = environmental.maxOf { candidate ->
                environmentalSupport(segment, candidate.latitude, candidate.longitude, candidate.uncertaintyM, candidate.supportWeight)
            }
            // Current particle ordering remains a weak prior. Environment may reorder it, but lack
            // of environmental support never deletes an alternative.
            val orderPrior = ((originalIds.size - index).toDouble() / originalIds.size * 0.10).coerceIn(0.0, 0.10)
            // Historical frequency is tie-breaking context only, never route truth.
            val history = if (segment.source == RouteSegmentSource.LEARNED) {
                (segment.observations.coerceAtMost(8) / 8.0 * 0.05).coerceIn(0.0, 0.05)
            } else 0.03
            Ranked(id, environmentScore, orderPrior, history)
        }

        val reranked = ranked.sortedWith(
            compareByDescending<Ranked> { it.environment }
                .thenByDescending { it.originalPrior + it.historyTie }
        ).map { it.id }
        if (reranked == originalIds) return phase3

        // Metadata-only update: numerical position truth remains exactly the Phase 3 result.
        return phase3.copy(position = phase3.position.copy(routeCandidateIds = reranked))
    }

    private fun environmentalSupport(
        segment: LocalRouteSegment,
        latitude: Double,
        longitude: Double,
        uncertaintyM: Float,
        supportWeight: Double
    ): Double {
        val distanceM = GeoMath.nearestOnSegment(
            latitude,
            longitude,
            segment.aLat,
            segment.aLon,
            segment.bLat,
            segment.bLon
        ).distanceM
        val excess = max(0.0, distanceM - uncertaintyM)
        val scale = max(75.0, uncertaintyM * 0.75)
        val proximity = exp(-excess / scale)
        return (supportWeight * proximity).coerceIn(0.0, 0.92)
    }
}
