package com.brick.safety.atlas

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.sqrt

class EnvironmentalAtlas(
    private val maxLabels: Int = 192,
    private val maxSignals: Int = 4_096
) {
    companion object {
        private const val TRAINING_POSITION_MAX_AGE_MS = 15_000L
        private const val TRAINING_WALL_SKEW_MS = 2L * 60L * 1_000L
        private const val MAX_TRAINING_ACCURACY_M = 50f
        private const val MIN_SCAN_QUALITY = 0.25f
        private const val VISIT_GAP_MS = 15L * 60L * 1_000L
        private const val DAY_MS = 24L * 60L * 60L * 1_000L
        private const val MODEL_RETENTION_MS = 180L * DAY_MS
    }

    private data class RunningValue(
        var count: Int = 0,
        var mean: Double = 0.0,
        var m2: Double = 0.0
    ) {
        fun add(value: Double) {
            count += 1
            val delta = value - mean
            mean += delta / count
            val delta2 = value - mean
            m2 += delta * delta2
        }
        fun variance(): Double? = if (count >= 2) (m2 / (count - 1)).coerceAtLeast(0.0) else null
    }

    private data class LabelSignal(
        var seenScans: Int = 0,
        var seenVisits: Int = 0,
        var lastSeenWallMs: Long = 0L,
        val measurement: RunningValue = RunningValue()
    )

    private data class LabelProfile(
        val id: String,
        var latitude: Double,
        var longitude: Double,
        var accuracyMean: Double,
        var scanCount: Int = 0,
        var visitCount: Int = 0,
        var lastScanWallMs: Long = 0L,
        var lastVisitWallMs: Long = 0L,
        var zoneId: String? = null,
        val signals: MutableMap<String, LabelSignal> = linkedMapOf()
    )

    private data class SignalProfile(
        val key: String,
        val kind: AtlasSignalKind,
        val signalId: String,
        var observationCount: Int = 0,
        var healthyCount: Int = 0,
        var qualitySum: Double = 0.0,
        var firstSeenWallMs: Long = 0L,
        var lastSeenWallMs: Long = 0L,
        var semanticCommon: Boolean = false,
        var trustedAnchor: Boolean = false,
        val measurement: RunningValue = RunningValue(),
        val labelIds: MutableSet<String> = linkedSetOf()
    )

    private val labels = linkedMapOf<String, LabelProfile>()
    private val signals = linkedMapOf<String, SignalProfile>()

    @Synchronized
    fun observeTrusted(label: AtlasTrustedLabel, scan: AtlasScan): Boolean {
        if (!trainingAllowed(label, scan)) return false
        prune(scan.wallTimeMs)
        val observations = normalized(scan.observations)
        if (observations.isEmpty()) return false

        val lp = labels[label.labelId] ?: LabelProfile(
            label.labelId,
            label.latitude,
            label.longitude,
            label.accuracyM.toDouble(),
            zoneId = label.zoneId
        ).also { labels[label.labelId] = it }

        val priorScans = lp.scanCount
        lp.scanCount += 1
        val alpha = 1.0 / lp.scanCount.coerceAtMost(20)
        lp.latitude = lp.latitude * (1.0 - alpha) + label.latitude * alpha
        lp.longitude = lp.longitude * (1.0 - alpha) + label.longitude * alpha
        lp.accuracyMean = lp.accuracyMean * (1.0 - alpha) + label.accuracyM * alpha
        lp.zoneId = label.zoneId ?: lp.zoneId
        val newVisit = lp.lastVisitWallMs <= 0L || scan.wallTimeMs - lp.lastVisitWallMs >= VISIT_GAP_MS
        if (newVisit) {
            lp.visitCount += 1
            lp.lastVisitWallMs = scan.wallTimeMs
        }
        lp.lastScanWallMs = max(lp.lastScanWallMs, scan.wallTimeMs)

        for (obs in observations) {
            val key = key(obs.kind, obs.signalId)
            val sp = signals[key] ?: SignalProfile(key, obs.kind, obs.signalId).also { signals[key] = it }
            sp.observationCount += 1
            if (obs.sourceHealthy) sp.healthyCount += 1
            sp.qualitySum += obs.quality
            if (sp.firstSeenWallMs <= 0L) sp.firstSeenWallMs = scan.wallTimeMs
            sp.lastSeenWallMs = max(sp.lastSeenWallMs, scan.wallTimeMs)
            sp.semanticCommon = sp.semanticCommon || obs.semanticCommon
            sp.trustedAnchor = sp.trustedAnchor || obs.trustedAnchor
            obs.measurement?.let { sp.measurement.add(it.toDouble()) }
            sp.labelIds += lp.id

            val ls = lp.signals[key] ?: LabelSignal().also { lp.signals[key] = it }
            ls.seenScans += 1
            if (newVisit) ls.seenVisits += 1
            ls.lastSeenWallMs = max(ls.lastSeenWallMs, scan.wallTimeMs)
            obs.measurement?.let { ls.measurement.add(it.toDouble()) }
        }

        // A label may have existed before this scan; intentionally do not treat every absence as
        // negative training. Presence ratios emerge over repeated complete scans instead.
        if (priorScans == 0) lp.lastVisitWallMs = scan.wallTimeMs
        trimBounds()
        return true
    }

    @Synchronized
    fun match(scan: AtlasScan): List<AtlasMatchCandidate> {
        if (scan.observations.isEmpty() || scan.quality < 0.15f) return emptyList()
        prune(scan.wallTimeMs)
        val observations = normalized(scan.observations)
        if (observations.isEmpty()) return emptyList()
        val observedByKey = observations.associateBy { key(it.kind, it.signalId) }
        val observedKinds = observations.mapTo(hashSetOf()) { it.kind }
        val candidates = ArrayList<AtlasMatchCandidate>()

        for (label in labels.values) {
            if (label.scanCount < 2) continue
            val groupContributions = linkedMapOf<String, MutableList<Double>>()
            var matchedSignals = 0

            for (obs in observations) {
                val k = key(obs.kind, obs.signalId)
                val local = label.signals[k] ?: continue
                val global = signals[k] ?: continue
                val stats = stats(global, scan.wallTimeMs)
                val classification = SignalTrustEngine.classify(stats, scan.wallTimeMs)
                val trust = SignalTrustEngine.weight(stats, classification, scan.wallTimeMs)
                if (trust <= 0.01) continue
                val presence = (local.seenScans.toDouble() / label.scanCount.coerceAtLeast(1)).coerceIn(0.0, 1.0)
                val similarity = SignalTrustEngine.measurementSimilarity(
                    obs.measurement,
                    local.measurement.mean.takeIf { local.measurement.count > 0 }?.toFloat(),
                    local.measurement.variance()
                )
                val contribution = trust * (0.35 + 0.65 * presence) * similarity * obs.quality
                if (contribution <= 0.01) continue
                groupContributions.getOrPut(obs.independenceGroup) { arrayListOf() } += contribution
                matchedSignals += 1
            }

            if (matchedSignals == 0) continue
            var groupTotal = 0.0
            for (values in groupContributions.values) {
                val strongest = values.sortedDescending().take(4)
                // Correlated observations inside one independence group have a hard cap. Ten APs
                // from one Wi-Fi scan do not become ten independent confirmations.
                groupTotal += strongest.sum().coerceAtMost(0.95)
            }
            var positive = (1.0 - exp(-groupTotal)).coerceIn(0.0, 0.92)

            var negative = 0.0
            if (scan.quality >= 0.55f) {
                for ((k, local) in label.signals) {
                    if (k in observedByKey) continue
                    val global = signals[k] ?: continue
                    if (global.kind !in observedKinds) continue // provider absent/unavailable is not negative evidence
                    val presence = local.seenScans.toDouble() / label.scanCount.coerceAtLeast(1)
                    if (presence < 0.75 || local.seenScans < 4) continue
                    val stats = stats(global, scan.wallTimeMs)
                    val classification = SignalTrustEngine.classify(stats, scan.wallTimeMs)
                    val trust = SignalTrustEngine.weight(stats, classification, scan.wallTimeMs)
                    if (trust < 0.50) continue
                    negative += 0.025 * trust
                    if (negative >= 0.15) { negative = 0.15; break }
                }
            }

            positive = (positive - negative).coerceAtLeast(0.0)
            if (label.visitCount < 2) positive = positive.coerceAtMost(0.20)
            if (matchedSignals < 2) positive = positive.coerceAtMost(0.25)
            if (groupContributions.size < 2) positive = positive.coerceAtMost(0.45)
            if (positive < 0.05) continue

            val uncertainty = max(35.0, label.accuracyMean + (1.0 - positive) * 140.0).coerceAtMost(500.0).toFloat()
            candidates += AtlasMatchCandidate(
                label.id,
                label.latitude,
                label.longitude,
                uncertainty,
                positive,
                matchedSignals,
                groupContributions.size,
                negative,
                false
            )
        }

        val sorted = candidates.sortedByDescending { it.supportWeight }.take(8).toMutableList()
        if (sorted.isEmpty()) return emptyList()
        val top = sorted.first().supportWeight
        val second = sorted.getOrNull(1)?.supportWeight
        for (i in sorted.indices) {
            val c = sorted[i]
            val ambiguous = when {
                i > 0 -> top - c.supportWeight < 0.12
                second != null -> top - second < 0.12
                else -> false
            }
            sorted[i] = c.copy(ambiguous = ambiguous)
        }
        return sorted
    }

    @Synchronized
    fun signalSummary(kind: AtlasSignalKind, signalId: String, nowWallMs: Long): AtlasSignalSummary? {
        val profile = signals[key(kind, signalId)] ?: return null
        val stats = stats(profile, nowWallMs)
        val classification = SignalTrustEngine.classify(stats, nowWallMs)
        return AtlasSignalSummary(
            kind,
            signalId,
            classification,
            stats.observationCount,
            stats.distinctLabels,
            stats.geographicSpreadM,
            stats.lastSeenWallMs,
            stats.meanQuality,
            stats.sourceHealthRatio,
            stats.measurementMean,
            stats.measurementVariance?.let { sqrt(it).toFloat() },
            SignalTrustEngine.weight(stats, classification, nowWallMs)
        )
    }

    @Synchronized fun labelCount(): Int = labels.size
    @Synchronized fun signalCount(): Int = signals.size

    @Synchronized
    fun prune(nowWallMs: Long) {
        if (nowWallMs <= 0L) return
        val cutoff = nowWallMs - MODEL_RETENTION_MS
        val staleLabels = labels.values.filter { it.lastScanWallMs in 1 until cutoff }.map { it.id }
        staleLabels.forEach(::removeLabel)

        val staleSignals = signals.values.filter { it.lastSeenWallMs in 1 until cutoff }.map { it.key }
        staleSignals.forEach { k ->
            signals.remove(k)
            labels.values.forEach { it.signals.remove(k) }
        }
    }

    private fun trainingAllowed(label: AtlasTrustedLabel, scan: AtlasScan): Boolean {
        if (label.accuracyM > MAX_TRAINING_ACCURACY_M || scan.quality < MIN_SCAN_QUALITY) return false
        if (abs(scan.elapsedRealtimeMs - label.elapsedRealtimeMs) > TRAINING_POSITION_MAX_AGE_MS) return false
        if (abs(scan.wallTimeMs - label.wallTimeMs) > TRAINING_WALL_SKEW_MS) return false
        if (scan.wallTimeMs <= 0L || label.wallTimeMs <= 0L) return false
        return true
    }

    private fun normalized(input: List<AtlasSignalObservation>): List<AtlasSignalObservation> {
        val byKey = linkedMapOf<String, AtlasSignalObservation>()
        for (obs in input.take(128)) {
            val k = key(obs.kind, obs.signalId)
            val prior = byKey[k]
            if (prior == null || obs.quality > prior.quality) byKey[k] = obs
        }
        return byKey.values.toList()
    }

    private fun stats(profile: SignalProfile, nowWallMs: Long): AtlasSignalStats {
        val labelProfiles = profile.labelIds.mapNotNull(labels::get)
        var spread = 0.0
        for (i in labelProfiles.indices) for (j in i + 1 until labelProfiles.size) {
            val a = labelProfiles[i]; val b = labelProfiles[j]
            spread = max(spread, AtlasGeo.distanceM(a.latitude, a.longitude, b.latitude, b.longitude))
        }
        var strongestPresence = 0f
        var trustedVisits = 0
        for (label in labelProfiles) {
            val local = label.signals[profile.key] ?: continue
            strongestPresence = max(strongestPresence, (local.seenScans.toFloat() / label.scanCount.coerceAtLeast(1)).coerceIn(0f, 1f))
            trustedVisits = max(trustedVisits, local.seenVisits)
        }
        return AtlasSignalStats(
            profile.kind,
            profile.signalId,
            profile.observationCount,
            profile.observationCount,
            labelProfiles.size,
            spread,
            profile.firstSeenWallMs,
            profile.lastSeenWallMs,
            if (profile.observationCount > 0) (profile.qualitySum / profile.observationCount).toFloat().coerceIn(0f, 1f) else 0f,
            if (profile.observationCount > 0) (profile.healthyCount.toFloat() / profile.observationCount).coerceIn(0f, 1f) else 0f,
            profile.measurement.mean.takeIf { profile.measurement.count > 0 }?.toFloat(),
            profile.measurement.variance(),
            strongestPresence,
            trustedVisits,
            profile.semanticCommon,
            profile.trustedAnchor
        )
    }

    private fun trimBounds() {
        while (labels.size > maxLabels) {
            val oldest = labels.values.minByOrNull { it.lastScanWallMs } ?: break
            removeLabel(oldest.id)
        }
        if (signals.size > maxSignals) {
            val drop = signals.values
                .sortedWith(compareBy<SignalProfile> { it.trustedAnchor }.thenBy { it.lastSeenWallMs }.thenBy { it.observationCount })
                .take(signals.size - maxSignals)
                .map { it.key }
            for (k in drop) {
                signals.remove(k)
                labels.values.forEach { it.signals.remove(k) }
            }
        }
    }

    private fun removeLabel(labelId: String) {
        val removed = labels.remove(labelId) ?: return
        for (k in removed.signals.keys) {
            val sp = signals[k] ?: continue
            sp.labelIds.remove(labelId)
            if (sp.labelIds.isEmpty()) signals.remove(k)
        }
    }

    private fun key(kind: AtlasSignalKind, signalId: String) = "${kind.ordinal}:$signalId"
}
