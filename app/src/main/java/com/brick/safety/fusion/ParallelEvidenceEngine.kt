package com.brick.safety.fusion

import com.brick.safety.location.GeoMath
import com.brick.safety.location.PositionQuality
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Central degraded-position fusion for Brick V1 Phase 5.
 *
 * Design rules:
 * - correlated observations are collapsed by independenceGroup before weighting;
 * - weak evidence alone cannot create tight coordinates;
 * - conflicts expand uncertainty instead of choosing the nicest answer;
 * - non-fused evidence can never return PRECISE/ASSISTED;
 * - supportWeight is an internal ordering weight, never a probability.
 */
class ParallelEvidenceEngine {
    companion object {
        private const val MIN_OUTPUT_RADIUS_M = 15f
        private const val MAX_OUTPUT_RADIUS_M = 50_000f
        private const val CONFLICT_SLACK_M = 20.0
    }

    private data class Ranked(
        val c: FusionConstraint,
        val ageMs: Long,
        val freshness: Double,
        val effective: Double
    )

    fun fuse(nowElapsedMs: Long, constraints: Collection<FusionConstraint>): FusionResult {
        require(nowElapsedMs >= 0L)
        val fresh = constraints.mapNotNull { c -> rank(nowElapsedMs, c) }
        if (fresh.isEmpty()) return unknown(nowElapsedMs)

        // Anti-double-counting: only the strongest current interpretation from a physical/logical
        // independence group may contribute numerical weight. Other members remain available to
        // upstream audit/history, but cannot multiply confidence in the same fusion decision.
        val independent = fresh
            .groupBy { it.c.independenceGroup }
            .mapNotNull { (_, values) -> values.maxWithOrNull(compareBy<Ranked> { it.effective }.thenBy { -it.c.radiusM }) }
            .sortedByDescending { it.effective }
            .take(16)

        if (independent.isEmpty()) return unknown(nowElapsedMs)

        val center = weightedCenter(independent) ?: return unknown(nowElapsedMs)
        val conflicts = detectConflicts(independent)
        val severeConflict = conflicts.maxOfOrNull { it.severity } ?: 0.0
        val conflictExpansion = (1.0 + conflicts.sumOf { min(0.75, it.severity * 0.35) }).coerceIn(1.0, 3.5)

        val coverage = independent.map { ranked ->
            val d = GeoMath.distanceMeters(center.first, center.second, ranked.c.latitude, ranked.c.longitude)
            Triple(d + ranked.c.radiusM, ranked.effective, ranked)
        }.sortedBy { it.first }
        val baseRadius = weightedCoverageRadius(coverage)

        val agreeing = independent.count { ranked ->
            val d = GeoMath.distanceMeters(center.first, center.second, ranked.c.latitude, ranked.c.longitude)
            d <= ranked.c.radiusM + max(25.0, baseRadius * 0.35)
        }

        val floor = honestyFloor(independent, agreeing, severeConflict)
        var uncertainty = max(baseRadius, floor) * conflictExpansion
        if (severeConflict >= 1.0) uncertainty = max(uncertainty, baseRadius + 100.0 * severeConflict)
        uncertainty = uncertainty.coerceIn(MIN_OUTPUT_RADIUS_M.toDouble(), MAX_OUTPUT_RADIUS_M.toDouble())

        val state = chooseState(independent, conflicts, agreeing, uncertainty)
        val shape = chooseShape(independent, state)
        val confidence = confidenceBand(independent, conflicts, agreeing, uncertainty)
        val routeIds = independent
            .flatMap { it.c.routeCandidateIds }
            .distinct()
            .take(8)
        val used = independent.map {
            FusionEvidenceUse(
                id = it.c.id,
                kind = it.c.kind,
                independenceGroup = it.c.independenceGroup,
                ageMs = it.ageMs,
                radiusM = it.c.radiusM,
                explanation = it.c.explanation
            )
        }

        return FusionResult(
            latitude = center.first,
            longitude = center.second,
            uncertaintyM = uncertainty.toFloat(),
            state = state,
            shape = shape,
            confidenceBand = confidence,
            evidenceUsed = used,
            conflicts = conflicts,
            independenceGroups = independent.size,
            routeCandidateIds = routeIds,
            computedElapsedMs = nowElapsedMs
        )
    }

    private fun rank(nowElapsedMs: Long, c: FusionConstraint): Ranked? {
        if (c.observedElapsedMs > nowElapsedMs) return null
        val age = nowElapsedMs - c.observedElapsedMs
        if (age > c.maxAgeMs) return null
        val freshness = when {
            age <= c.maxAgeMs / 5 -> 1.0
            else -> (1.0 - age.toDouble() / c.maxAgeMs).coerceIn(0.15, 1.0)
        }
        // Geometry/uncertainty affects informativeness, not source trust. A claimed tiny radius must
        // never turn weak/spoofable evidence into a dominant vote, so precision only has a bounded
        // square-root effect. Coverage/overlap below still uses the full reported radius honestly.
        val precisionFactor = (1.0 / sqrt(max(25.0, c.radiusM.toDouble()) / 100.0)).coerceIn(0.55, 1.25)
        val effective = c.supportWeight * c.strength.multiplier * freshness * precisionFactor
        if (!effective.isFinite() || effective <= 0.0) return null
        return Ranked(c, age, freshness, effective)
    }

    private fun weightedCenter(items: List<Ranked>): Pair<Double, Double>? {
        if (items.isEmpty()) return null
        val weights = items.map { Triple(it.c.latitude, it.c.longitude, it.effective) }
        return GeoMath.weightedCentroid(weights)
    }

    private fun weightedCoverageRadius(items: List<Triple<Double, Double, Ranked>>): Double {
        if (items.isEmpty()) return MAX_OUTPUT_RADIUS_M.toDouble()
        val total = items.sumOf { it.second }
        if (total <= 0.0) return items.maxOf { it.first }
        var cumulative = 0.0
        for ((radius, weight, _) in items) {
            cumulative += weight
            if (cumulative / total >= 0.90) return radius
        }
        return items.last().first
    }

    private fun detectConflicts(items: List<Ranked>): List<FusionConflict> {
        val out = ArrayList<FusionConflict>()
        for (i in items.indices) {
            for (j in i + 1 until items.size) {
                val a = items[i].c
                val b = items[j].c
                val separation = GeoMath.distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude)
                val overlap = a.radiusM + b.radiusM + CONFLICT_SLACK_M
                if (separation <= overlap) continue
                val severity = ((separation - overlap) / max(50.0, max(a.radiusM.toDouble(), b.radiusM.toDouble())))
                    .coerceIn(0.0, 8.0)
                if (severity < 0.10) continue
                out += FusionConflict(a.id, b.id, separation, overlap, severity)
            }
        }
        return out.sortedByDescending { it.severity }.take(12)
    }

    private fun honestyFloor(items: List<Ranked>, agreeing: Int, severeConflict: Double): Double {
        val strongest = items.maxByOrNull { it.effective }?.c ?: return MAX_OUTPUT_RADIUS_M.toDouble()
        val base = when {
            strongest.strength == FusionStrength.AUTHORITATIVE_AREA -> max(25.0, strongest.radiusM.toDouble())
            items.size == 1 && strongest.strength == FusionStrength.WEAK -> max(250.0, strongest.radiusM.toDouble())
            items.size == 1 && strongest.strength == FusionStrength.MEDIUM -> max(120.0, strongest.radiusM.toDouble())
            items.size == 1 -> max(60.0, strongest.radiusM.toDouble())
            agreeing >= 3 -> 25.0
            agreeing >= 2 -> 35.0
            else -> 100.0
        }
        return if (severeConflict >= 0.5) max(base, 100.0) else base
    }

    private fun chooseState(
        items: List<Ranked>,
        conflicts: List<FusionConflict>,
        agreeing: Int,
        uncertaintyM: Double
    ): PositionQuality {
        if (items.size == 1) {
            return when (items.first().c.kind) {
                FusionEvidenceKind.LAST_KNOWN -> PositionQuality.LAST_KNOWN
                FusionEvidenceKind.COARSE_NETWORK, FusionEvidenceKind.NETWORK_CONTEXT -> PositionQuality.COARSE
                FusionEvidenceKind.LEARNED_PLACE,
                FusionEvidenceKind.BLE_ANCHOR,
                FusionEvidenceKind.GROUND_RECEIVER,
                FusionEvidenceKind.WITNESS -> if (items.first().c.strength >= FusionStrength.STRONG) PositionQuality.ANCHORED else PositionQuality.ESTIMATED
                else -> PositionQuality.ESTIMATED
            }
        }

        val maxConflict = conflicts.maxOfOrNull { it.severity } ?: 0.0
        if (maxConflict >= 1.0 || uncertaintyM >= 2_500.0) return PositionQuality.COARSE

        val strongAnchor = items.any {
            it.c.strength == FusionStrength.AUTHORITATIVE_AREA ||
                (it.c.strength == FusionStrength.STRONG && it.c.kind in setOf(
                    FusionEvidenceKind.LEARNED_PLACE,
                    FusionEvidenceKind.BLE_ANCHOR,
                    FusionEvidenceKind.GROUND_RECEIVER,
                    FusionEvidenceKind.WITNESS
                ))
        }
        if (strongAnchor && agreeing >= 1 && maxConflict < 0.45) return PositionQuality.ANCHORED

        val onlyCoarse = items.all { it.c.upperState == PositionQuality.COARSE || it.c.kind == FusionEvidenceKind.NETWORK_CONTEXT }
        if (onlyCoarse) return PositionQuality.COARSE

        return PositionQuality.ESTIMATED
    }

    private fun chooseShape(items: List<Ranked>, state: PositionQuality): FusionShapeKind {
        val strongest = items.maxByOrNull { it.effective }?.c ?: return FusionShapeKind.UNKNOWN
        return when {
            strongest.kind == FusionEvidenceKind.GROUND_RECEIVER -> FusionShapeKind.RECEIVER_AREA
            strongest.kind == FusionEvidenceKind.WITNESS -> FusionShapeKind.WITNESS_AREA
            strongest.kind == FusionEvidenceKind.LEARNED_PLACE || state == PositionQuality.ANCHORED -> FusionShapeKind.PLACE_AREA
            items.any { it.c.shapeHint == FusionShapeKind.CORRIDOR && it.c.routeCandidateIds.isNotEmpty() } -> FusionShapeKind.CORRIDOR
            strongest.kind == FusionEvidenceKind.LAST_KNOWN -> FusionShapeKind.LAST_KNOWN_AREA
            items.size >= 2 -> FusionShapeKind.POSSIBLE_AREA
            else -> strongest.shapeHint
        }
    }

    private fun confidenceBand(
        items: List<Ranked>,
        conflicts: List<FusionConflict>,
        agreeing: Int,
        uncertaintyM: Double
    ): FusionConfidenceBand {
        val maxConflict = conflicts.maxOfOrNull { it.severity } ?: 0.0
        return when {
            maxConflict >= 1.0 || uncertaintyM >= 5_000.0 -> FusionConfidenceBand.VERY_LOW
            maxConflict >= 0.45 || agreeing <= 0 || uncertaintyM >= 1_000.0 -> FusionConfidenceBand.LOW
            agreeing >= 2 && items.size >= 2 && uncertaintyM <= 250.0 -> FusionConfidenceBand.HIGH
            else -> FusionConfidenceBand.MEDIUM
        }
    }

    private fun unknown(nowElapsedMs: Long) = FusionResult(
        latitude = null,
        longitude = null,
        uncertaintyM = MAX_OUTPUT_RADIUS_M,
        state = PositionQuality.UNKNOWN,
        shape = FusionShapeKind.UNKNOWN,
        confidenceBand = FusionConfidenceBand.VERY_LOW,
        evidenceUsed = emptyList(),
        conflicts = emptyList(),
        independenceGroups = 0,
        routeCandidateIds = emptyList(),
        computedElapsedMs = nowElapsedMs
    )
}
