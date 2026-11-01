package com.brick.safety.atlas

import com.brick.safety.activity.ActivityMode
import java.util.ArrayDeque
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Learns short environmental/activity transitions without turning them into a second positioning
 * engine. Inputs are already privacy-reduced Atlas observations; this class HMAC-reduces state and
 * transition signatures again before they can enter long-lived Atlas state.
 *
 * Transition and gradient evidence is deliberately correlated with its source and low-trust in
 * [SignalTrustEngine]. It can support repeated approach/departure recognition but can never decide
 * the child's location by itself. Final fusion remains Phase 5 work.
 */
internal class AtlasTransitionTracker(
    private val sourceGapMs: Long = 5L * 60L * 1_000L,
    private val sequenceGapMs: Long = 5L * 60L * 1_000L
) {
    private data class SourceState(
        val keys: Set<String>,
        val measurements: Map<String, Float>,
        val signature: String,
        val elapsedMs: Long,
        val wallMs: Long,
        val quality: Float
    )

    private data class RecentTransition(
        val id: String,
        val elapsedMs: Long,
        val quality: Float
    )

    private val sourceStates = linkedMapOf<String, SourceState>()
    private val recentTransitions = ArrayDeque<RecentTransition>()
    private var activityMode: ActivityMode? = null
    private var activityElapsedMs: Long = 0L
    private var activityQuality: Float = 0f

    @Synchronized
    fun augmentSource(source: String, scan: AtlasScan): AtlasScan {
        val normalizedSource = source.lowercase().replace(Regex("[^a-z0-9._-]"), "_").take(24)
            .ifBlank { "source" }
        val eligible = scan.observations.asSequence()
            .filter { it.kind != AtlasSignalKind.TRANSITION && it.quality >= 0.20f }
            .sortedByDescending { it.quality }
            .take(10)
            .toList()
        val keys = eligible.map { "${it.kind.ordinal}:${it.signalId}" }.toSet()
        if (keys.isEmpty()) return scan
        val measurements = eligible.mapNotNull { observation ->
            observation.measurement?.takeIf { it.isFinite() }?.let {
                "${observation.kind.ordinal}:${observation.signalId}" to it
            }
        }.toMap()

        val signature = AtlasPrivacyId.reduce("state", "$normalizedSource|${keys.sorted().joinToString(",")}")
        val current = SourceState(keys, measurements, signature, scan.elapsedRealtimeMs, scan.wallTimeMs, scan.quality)
        val previous = sourceStates.put(normalizedSource, current) ?: return scan
        val delta = scan.elapsedRealtimeMs - previous.elapsedMs
        if (delta !in 1..sourceGapMs) return scan

        val additions = ArrayList<AtlasSignalObservation>(3)
        gradientObservation(normalizedSource, previous, current, scan)?.let { gradient ->
            additions += gradient
            sequenceObservation(
                gradient.signalId,
                scan.elapsedRealtimeMs,
                gradient.quality,
                gradient.independenceGroup
            )?.let(additions::add)
        }

        if (previous.signature != signature && setSimilarity(previous.keys, keys) < 0.55) {
            val transitionId = AtlasPrivacyId.reduce("trans", "$normalizedSource|${previous.signature}>$signature")
            val group = scan.observations.firstOrNull { it.kind != AtlasSignalKind.TRANSITION }
                ?.independenceGroup ?: "atlas.transition"
            val quality = (min(previous.quality, scan.quality) * 0.65f).coerceIn(0.10f, 0.70f)
            additions += AtlasSignalObservation(
                kind = AtlasSignalKind.TRANSITION,
                signalId = transitionId,
                independenceGroup = group,
                quality = quality,
                sourceHealthy = true
            )
            sequenceObservation(transitionId, scan.elapsedRealtimeMs, quality, group)?.let(additions::add)
        }

        return if (additions.isEmpty()) scan else scan.copy(observations = (scan.observations + additions).take(128))
    }

    private fun gradientObservation(
        source: String,
        previous: SourceState,
        current: SourceState,
        scan: AtlasScan
    ): AtlasSignalObservation? {
        if (source != "wifi") return null
        val changes = current.measurements.entries.mapNotNull { (key, value) ->
            if (!key.substringAfter(':').startsWith("wifi:")) return@mapNotNull null
            val before = previous.measurements[key] ?: return@mapNotNull null
            val change = value - before
            if (!change.isFinite() || abs(change) < 4f) return@mapNotNull null
            key to change
        }.sortedByDescending { abs(it.second) }.take(4)
        if (changes.size < 2) return null

        val meanAbs = changes.map { abs(it.second) }.average().toFloat()
        if (meanAbs < 6f) return null
        val pattern = changes.joinToString("|") { (key, change) ->
            val direction = if (change > 0f) "+" else "-"
            val bucket = (abs(change) / 5f).roundToInt().coerceIn(1, 8)
            "$key:$direction$bucket"
        }
        val id = AtlasPrivacyId.reduce("grad", pattern)
        val quality = (min(previous.quality, current.quality) * (0.35f + (meanAbs / 40f).coerceAtMost(0.25f)))
            .coerceIn(0.12f, 0.55f)
        val group = scan.observations.firstOrNull { it.signalId.startsWith("wifi:") }?.independenceGroup
            ?: "wifi.scan"
        return AtlasSignalObservation(
            kind = AtlasSignalKind.TRANSITION,
            signalId = id,
            independenceGroup = group,
            measurement = meanAbs,
            quality = quality,
            sourceHealthy = true
        )
    }

    @Synchronized
    fun activityTransition(
        mode: ActivityMode,
        confidence: Int,
        elapsedMs: Long,
        wallMs: Long
    ): AtlasScan? {
        if (mode == ActivityMode.UNKNOWN || confidence < 40 || elapsedMs <= 0L || wallMs <= 0L) return null
        val quality = (confidence.coerceIn(0, 100) / 100f * 0.65f).coerceIn(0.20f, 0.65f)
        val previousMode = activityMode
        val previousElapsed = activityElapsedMs
        val previousQuality = activityQuality
        activityMode = mode
        activityElapsedMs = elapsedMs
        activityQuality = quality

        if (previousMode == null || previousMode == mode) return null
        val delta = elapsedMs - previousElapsed
        if (delta !in 1..sourceGapMs) return null

        val transitionId = AtlasPrivacyId.reduce("trans", "activity|${previousMode.name}>${mode.name}")
        val transitionQuality = (min(previousQuality, quality) * 0.85f).coerceIn(0.15f, 0.60f)
        val group = "activity.transition"
        val observations = ArrayList<AtlasSignalObservation>(2)
        observations += AtlasSignalObservation(
            kind = AtlasSignalKind.TRANSITION,
            signalId = transitionId,
            independenceGroup = group,
            quality = transitionQuality,
            sourceHealthy = true
        )
        sequenceObservation(transitionId, elapsedMs, transitionQuality, group)?.let(observations::add)
        return AtlasScan(elapsedMs, wallMs, transitionQuality, observations)
    }

    @Synchronized
    fun resetRecent() {
        sourceStates.clear()
        recentTransitions.clear()
        activityMode = null
        activityElapsedMs = 0L
        activityQuality = 0f
    }

    private fun sequenceObservation(
        id: String,
        elapsedMs: Long,
        quality: Float,
        independenceGroup: String
    ): AtlasSignalObservation? {
        while (recentTransitions.isNotEmpty() &&
            elapsedMs - (recentTransitions.peekFirst()?.elapsedMs ?: elapsedMs) > sequenceGapMs) {
            recentTransitions.removeFirst()
        }
        recentTransitions.addLast(RecentTransition(id, elapsedMs, quality))
        while (recentTransitions.size > 4) recentTransitions.removeFirst()
        if (recentTransitions.size < 2) return null

        val recent = recentTransitions.toList().takeLast(3)
        val sequenceId = AtlasPrivacyId.reduce("seq", recent.joinToString(">") { it.id })
        val sequenceQuality = (recent.minOf { it.quality } * 0.55f).coerceIn(0.10f, 0.45f)
        return AtlasSignalObservation(
            kind = AtlasSignalKind.TRANSITION,
            signalId = sequenceId,
            independenceGroup = independenceGroup,
            quality = sequenceQuality,
            sourceHealthy = true
        )
    }

    private fun setSimilarity(a: Set<String>, b: Set<String>): Double {
        if (a.isEmpty() && b.isEmpty()) return 1.0
        val intersection = a.count { it in b }
        val union = a.size + b.size - intersection
        return if (union <= 0) 1.0 else intersection.toDouble() / union
    }
}
