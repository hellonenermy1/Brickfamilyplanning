package com.brick.safety.atlas

import com.brick.safety.activity.ActivityMode
import java.util.ArrayDeque
import kotlin.math.min

/**
 * Learns short environmental/activity transitions without turning them into a second positioning
 * engine. Inputs are already privacy-reduced Atlas observations; this class HMAC-reduces state and
 * transition signatures again before they can enter long-lived Atlas state.
 *
 * Transition evidence is deliberately correlated with the source observation and low-trust in
 * [SignalTrustEngine]. It can support repeated approach/departure recognition but can never decide
 * the child's location by itself. Final fusion remains Phase 5 work.
 */
internal class AtlasTransitionTracker(
    private val sourceGapMs: Long = 5L * 60L * 1_000L,
    private val sequenceGapMs: Long = 5L * 60L * 1_000L
) {
    private data class SourceState(
        val keys: Set<String>,
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
        val keys = scan.observations.asSequence()
            .filter { it.kind != AtlasSignalKind.TRANSITION && it.quality >= 0.20f }
            .sortedByDescending { it.quality }
            .take(10)
            .map { "${it.kind.ordinal}:${it.signalId}" }
            .toSet()
        if (keys.isEmpty()) return scan

        val signature = AtlasPrivacyId.reduce("state", "$normalizedSource|${keys.sorted().joinToString(",")}")
        val current = SourceState(keys, signature, scan.elapsedRealtimeMs, scan.wallTimeMs, scan.quality)
        val previous = sourceStates.put(normalizedSource, current) ?: return scan
        val delta = scan.elapsedRealtimeMs - previous.elapsedMs
        if (delta !in 1..sourceGapMs || previous.signature == signature) return scan

        // Ignore small set churn (for example one Wi-Fi AP momentarily disappearing). A source
        // transition needs a material environmental change before it becomes learned evidence.
        if (setSimilarity(previous.keys, keys) >= 0.55) return scan

        val transitionId = AtlasPrivacyId.reduce("trans", "$normalizedSource|${previous.signature}>$signature")
        val group = scan.observations.firstOrNull { it.kind != AtlasSignalKind.TRANSITION }
            ?.independenceGroup ?: "atlas.transition"
        val quality = (min(previous.quality, scan.quality) * 0.65f).coerceIn(0.10f, 0.70f)
        val transition = AtlasSignalObservation(
            kind = AtlasSignalKind.TRANSITION,
            signalId = transitionId,
            independenceGroup = group,
            quality = quality,
            sourceHealthy = true
        )
        val additions = ArrayList<AtlasSignalObservation>(2)
        additions += transition
        sequenceObservation(transitionId, scan.elapsedRealtimeMs, quality)?.let(additions::add)
        return scan.copy(observations = (scan.observations + additions).take(128))
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
        val observations = ArrayList<AtlasSignalObservation>(2)
        observations += AtlasSignalObservation(
            kind = AtlasSignalKind.TRANSITION,
            signalId = transitionId,
            independenceGroup = "activity.transition",
            quality = transitionQuality,
            sourceHealthy = true
        )
        sequenceObservation(transitionId, elapsedMs, transitionQuality)?.let(observations::add)
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

    private fun sequenceObservation(id: String, elapsedMs: Long, quality: Float): AtlasSignalObservation? {
        while (recentTransitions.isNotEmpty() &&
            elapsedMs - recentTransitions.first.elapsedMs > sequenceGapMs) {
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
            independenceGroup = "atlas.derived",
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
