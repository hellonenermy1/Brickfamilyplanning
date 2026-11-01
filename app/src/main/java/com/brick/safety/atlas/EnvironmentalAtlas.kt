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
        private const val FUTURE_TOLERANCE_MS = 24L * 60L * 60L * 1_000L
        private const val REPLACEMENT_RETIRE_MISSES = 12
        private const val CODEC_VERSION = 1
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

    /**
     * eligibleScans starts when this signal is first learned at the label. absenceGroup records the
     * exact observation domain allowed to teach disappearance; a printer discovery must not make a
     * missing TV count as negative evidence merely because both are LAN signals.
     */
    private data class LabelSignal(
        var seenScans: Int = 0,
        var eligibleScans: Int = 0,
        var seenVisits: Int = 0,
        var consecutiveTrustedMisses: Int = 0,
        var totalTrustedMisses: Int = 0,
        var lastSeenWallMs: Long = 0L,
        var lastMissingWallMs: Long = 0L,
        var absenceGroup: String = "",
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

        val observedKeys = observations.mapTo(hashSetOf()) { key(it.kind, it.signalId) }
        val observedKinds = observations.mapTo(hashSetOf()) { it.kind }
        val observedGroups = observations.mapTo(hashSetOf()) { it.independenceGroup }
        val retire = arrayListOf<String>()
        for ((signalKey, local) in lp.signals) {
            val global = signals[signalKey] ?: continue
            if (!absenceScopeObserved(local, global.kind, observedGroups, observedKinds)) continue
            local.eligibleScans = (local.eligibleScans + 1).coerceAtMost(1_000_000)
            if (signalKey in observedKeys) {
                local.consecutiveTrustedMisses = 0
                continue
            }
            if (scan.quality >= 0.55f) {
                local.consecutiveTrustedMisses = (local.consecutiveTrustedMisses + 1).coerceAtMost(REPLACEMENT_RETIRE_MISSES)
                local.totalTrustedMisses = (local.totalTrustedMisses + 1).coerceAtMost(1_000_000)
                local.lastMissingWallMs = scan.wallTimeMs
                if (local.seenScans >= 4 && local.seenVisits >= 2 &&
                    local.consecutiveTrustedMisses >= REPLACEMENT_RETIRE_MISSES) {
                    retire += signalKey
                }
            }
        }
        retire.forEach { retireRelation(lp, it) }

        for (obs in observations) {
            val signalKey = key(obs.kind, obs.signalId)
            val sp = signals[signalKey] ?: SignalProfile(signalKey, obs.kind, obs.signalId).also { signals[signalKey] = it }
            sp.observationCount += 1
            if (obs.sourceHealthy) sp.healthyCount += 1
            sp.qualitySum += obs.quality
            if (sp.firstSeenWallMs <= 0L) sp.firstSeenWallMs = scan.wallTimeMs
            sp.lastSeenWallMs = max(sp.lastSeenWallMs, scan.wallTimeMs)
            sp.semanticCommon = sp.semanticCommon || obs.semanticCommon
            sp.trustedAnchor = sp.trustedAnchor || obs.trustedAnchor
            obs.measurement?.let { sp.measurement.add(it.toDouble()) }
            sp.labelIds += lp.id

            val ls = lp.signals[signalKey] ?: LabelSignal(
                eligibleScans = 1,
                absenceGroup = obs.independenceGroup
            ).also { lp.signals[signalKey] = it }
            ls.seenScans += 1
            ls.consecutiveTrustedMisses = 0
            ls.absenceGroup = obs.independenceGroup
            if (newVisit) ls.seenVisits += 1
            ls.lastSeenWallMs = max(ls.lastSeenWallMs, scan.wallTimeMs)
            obs.measurement?.let { ls.measurement.add(it.toDouble()) }
        }

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
        val observedGroups = observations.mapTo(hashSetOf()) { it.independenceGroup }
        val candidates = ArrayList<AtlasMatchCandidate>()

        for (label in labels.values) {
            if (label.scanCount < 2) continue
            val groupContributions = linkedMapOf<String, MutableList<Double>>()
            var matchedSignals = 0

            for (obs in observations) {
                val signalKey = key(obs.kind, obs.signalId)
                val local = label.signals[signalKey] ?: continue
                val global = signals[signalKey] ?: continue
                val stats = stats(global, scan.wallTimeMs)
                val classification = SignalTrustEngine.classify(stats, scan.wallTimeMs)
                val trust = SignalTrustEngine.weight(stats, classification, scan.wallTimeMs)
                if (trust <= 0.01) continue
                val presence = presence(local)
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
                groupTotal += strongest.sum().coerceAtMost(0.95)
            }
            var positive = (1.0 - exp(-groupTotal)).coerceIn(0.0, 0.92)

            var negative = 0.0
            if (scan.quality >= 0.55f) {
                for ((signalKey, local) in label.signals) {
                    if (signalKey in observedByKey) continue
                    val global = signals[signalKey] ?: continue
                    if (!absenceScopeObserved(local, global.kind, observedGroups, observedKinds)) continue
                    if (local.seenScans < 4 || local.seenVisits < 2 || presence(local) < 0.45) continue
                    val stats = stats(global, scan.wallTimeMs)
                    val classification = SignalTrustEngine.classify(stats, scan.wallTimeMs)
                    val trust = SignalTrustEngine.weight(stats, classification, scan.wallTimeMs)
                    if (trust < 0.50) continue
                    val repeatedMiss = (local.consecutiveTrustedMisses.coerceAtMost(6) / 6.0).coerceIn(0.0, 1.0)
                    val learnedAbsence = if (local.eligibleScans > 0) {
                        (local.totalTrustedMisses.toDouble() / local.eligibleScans).coerceIn(0.0, 1.0)
                    } else 0.0
                    negative += (0.012 + 0.018 * repeatedMiss + 0.008 * learnedAbsence) * trust
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
        staleSignals.forEach { signalKey ->
            signals.remove(signalKey)
            labels.values.forEach { it.signals.remove(signalKey) }
        }
    }

    @Synchronized
    fun encode(nowWallMs: Long): String {
        prune(nowWallMs)
        val out = StringBuilder("A|$CODEC_VERSION\n")
        labels.values.sortedBy { it.id }.forEach { l ->
            out.append("L|").append(l.id).append('|').append(l.latitude).append('|').append(l.longitude).append('|')
                .append(l.accuracyMean).append('|').append(l.scanCount).append('|').append(l.visitCount).append('|')
                .append(l.lastScanWallMs).append('|').append(l.lastVisitWallMs).append('|').append(l.zoneId ?: "").append('\n')
            l.signals.entries.sortedBy { it.key }.forEach { (signalKey, s) ->
                out.append("R|").append(l.id).append('|').append(signalKey).append('|').append(s.seenScans).append('|')
                    .append(s.seenVisits).append('|').append(s.lastSeenWallMs).append('|').append(s.measurement.count).append('|')
                    .append(s.measurement.mean).append('|').append(s.measurement.m2).append('|')
                    .append(s.eligibleScans).append('|').append(s.consecutiveTrustedMisses).append('|')
                    .append(s.totalTrustedMisses).append('|').append(s.lastMissingWallMs).append('|')
                    .append(s.absenceGroup).append('\n')
            }
        }
        signals.values.sortedBy { it.key }.forEach { s ->
            out.append("S|").append(s.kind.ordinal).append('|').append(s.signalId).append('|').append(s.observationCount).append('|')
                .append(s.healthyCount).append('|').append(s.qualitySum).append('|').append(s.firstSeenWallMs).append('|')
                .append(s.lastSeenWallMs).append('|').append(if (s.semanticCommon) 1 else 0).append('|')
                .append(if (s.trustedAnchor) 1 else 0).append('|').append(s.measurement.count).append('|')
                .append(s.measurement.mean).append('|').append(s.measurement.m2).append('|')
                .append(s.labelIds.sorted().joinToString(",")).append('\n')
        }
        return out.toString()
    }

    @Synchronized
    fun restore(encoded: String?, nowWallMs: Long): Boolean {
        labels.clear(); signals.clear()
        if (encoded.isNullOrBlank()) return true
        return try {
            val lines = encoded.lineSequence().filter { it.isNotBlank() }.toList()
            require(lines.firstOrNull() == "A|$CODEC_VERSION")
            require(lines.size <= 20_000)
            val relationLines = ArrayList<List<String>>()
            for (line in lines.drop(1)) {
                val p = line.split('|')
                when (p.firstOrNull()) {
                    "L" -> {
                        if (p.size != 10) continue
                        val id = p[1].takeIf { it.matches(Regex("[A-Za-z0-9._:-]{3,96}")) } ?: continue
                        val lat = p[2].toDoubleOrNull()?.takeIf { it.isFinite() && it in -90.0..90.0 } ?: continue
                        val lon = p[3].toDoubleOrNull()?.takeIf { it.isFinite() && it in -180.0..180.0 } ?: continue
                        val acc = p[4].toDoubleOrNull()?.takeIf { it.isFinite() && it in 0.0..5_000.0 } ?: continue
                        val scans = p[5].toIntOrNull()?.takeIf { it in 1..1_000_000 } ?: continue
                        val visits = p[6].toIntOrNull()?.takeIf { it in 1..1_000_000 } ?: continue
                        val lastScan = validWall(p[7], nowWallMs) ?: continue
                        val lastVisit = validWall(p[8], nowWallMs) ?: continue
                        val zone = p[9].takeIf { it.isNotBlank() && it.matches(Regex("[A-Za-z0-9._:-]{1,64}")) }
                        labels[id] = LabelProfile(id, lat, lon, acc, scans, visits, lastScan, lastVisit, zone)
                    }
                    "S" -> {
                        if (p.size != 14) continue
                        val kind = AtlasSignalKind.entries.getOrNull(p[1].toIntOrNull() ?: -1) ?: continue
                        val id = p[2].takeIf { it.matches(Regex("[A-Za-z0-9._:-]{6,96}")) } ?: continue
                        val signalKey = key(kind, id)
                        val count = p[3].toIntOrNull()?.takeIf { it in 1..10_000_000 } ?: continue
                        val healthy = p[4].toIntOrNull()?.takeIf { it in 0..count } ?: continue
                        val quality = p[5].toDoubleOrNull()?.takeIf { it.isFinite() && it in 0.0..count.toDouble() } ?: continue
                        val first = validWall(p[6], nowWallMs) ?: continue
                        val last = validWall(p[7], nowWallMs) ?: continue
                        if (last < first) continue
                        val semantic = p[8] == "1"
                        val anchor = p[9] == "1"
                        val mCount = p[10].toIntOrNull()?.takeIf { it in 0..count } ?: continue
                        val mean = p[11].toDoubleOrNull()?.takeIf { it.isFinite() } ?: continue
                        val m2 = p[12].toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0.0 } ?: continue
                        val labelIds = p[13].split(',').filter { it.matches(Regex("[A-Za-z0-9._:-]{3,96}")) }.take(maxLabels)
                        val profile = SignalProfile(signalKey, kind, id, count, healthy, quality, first, last, semantic, anchor)
                        profile.measurement.count = mCount; profile.measurement.mean = mean; profile.measurement.m2 = m2
                        profile.labelIds += labelIds
                        signals[signalKey] = profile
                    }
                    "R" -> relationLines += p
                }
            }
            for (p in relationLines) {
                if (p.size != 9 && p.size != 13 && p.size != 14) continue
                val label = labels[p[1]] ?: continue
                val signalKey = p[2]
                val signal = signals[signalKey] ?: continue
                val scans = p[3].toIntOrNull()?.takeIf { it in 1..label.scanCount } ?: continue
                val visits = p[4].toIntOrNull()?.takeIf { it in 0..label.visitCount } ?: continue
                val last = validWall(p[5], nowWallMs) ?: continue
                val mCount = p[6].toIntOrNull()?.takeIf { it in 0..scans } ?: continue
                val mean = p[7].toDoubleOrNull()?.takeIf { it.isFinite() } ?: continue
                val m2 = p[8].toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0.0 } ?: continue
                val hasAbsenceHistory = p.size >= 13
                val eligible = if (hasAbsenceHistory) {
                    p[9].toIntOrNull()?.takeIf { it in scans..label.scanCount } ?: continue
                } else label.scanCount.coerceAtLeast(scans)
                val consecutiveMisses = if (hasAbsenceHistory) {
                    p[10].toIntOrNull()?.takeIf { it in 0..eligible } ?: continue
                } else 0
                val totalMisses = if (hasAbsenceHistory) {
                    p[11].toIntOrNull()?.takeIf { it in 0..eligible } ?: continue
                } else 0
                val lastMissing = if (hasAbsenceHistory) {
                    val raw = p[12].toLongOrNull() ?: continue
                    if (raw == 0L) 0L else validWall(p[12], nowWallMs) ?: continue
                } else 0L
                val absenceGroup = if (p.size == 14) {
                    p[13].takeIf { it.matches(Regex("[A-Za-z0-9._:-]{1,64}")) } ?: ""
                } else {
                    // Existing persisted LAN relations predate scoped discovery. Fail conservative:
                    // they cannot teach absence until re-observed under a concrete lan.nsd.* group.
                    if (signal.kind == AtlasSignalKind.LAN_SERVICE) "" else defaultAbsenceGroup(signal.kind)
                }
                val local = LabelSignal(
                    seenScans = scans,
                    eligibleScans = eligible,
                    seenVisits = visits,
                    consecutiveTrustedMisses = consecutiveMisses,
                    totalTrustedMisses = totalMisses,
                    lastSeenWallMs = last,
                    lastMissingWallMs = lastMissing,
                    absenceGroup = absenceGroup
                )
                local.measurement.count = mCount; local.measurement.mean = mean; local.measurement.m2 = m2
                label.signals[signalKey] = local
                signal.labelIds.add(label.id)
            }
            prune(nowWallMs)
            trimBounds()
            true
        } catch (_: Throwable) {
            labels.clear(); signals.clear(); false
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
            val signalKey = key(obs.kind, obs.signalId)
            val prior = byKey[signalKey]
            if (prior == null || obs.quality > prior.quality) byKey[signalKey] = obs
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
            strongestPresence = max(strongestPresence, presence(local).toFloat())
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

    private fun presence(local: LabelSignal): Double =
        (local.seenScans.toDouble() / local.eligibleScans.coerceAtLeast(1)).coerceIn(0.0, 1.0)

    private fun absenceScopeObserved(
        local: LabelSignal,
        kind: AtlasSignalKind,
        observedGroups: Set<String>,
        observedKinds: Set<AtlasSignalKind>
    ): Boolean {
        if (local.absenceGroup.isNotBlank()) return local.absenceGroup in observedGroups
        if (kind == AtlasSignalKind.LAN_SERVICE) return false
        return evidenceFamilyObserved(kind, observedKinds)
    }

    private fun defaultAbsenceGroup(kind: AtlasSignalKind): String = when (kind) {
        AtlasSignalKind.WIFI_AP, AtlasSignalKind.WIFI_SSID_HINT -> "wifi.scan"
        AtlasSignalKind.BLE_DEVICE -> "ble.scan"
        AtlasSignalKind.LAN_SERVICE -> ""
        AtlasSignalKind.CELLULAR -> "cell.env"
        AtlasSignalKind.GNSS_SKY -> "gnss.sky"
        AtlasSignalKind.NETWORK_CONTEXT -> "network.ctx"
        AtlasSignalKind.COMPANION -> "companion.presence"
        AtlasSignalKind.CHARGING -> "device.power"
        AtlasSignalKind.TRANSITION -> ""
    }

    private fun evidenceFamilyObserved(kind: AtlasSignalKind, observedKinds: Set<AtlasSignalKind>): Boolean = when (kind) {
        AtlasSignalKind.WIFI_AP, AtlasSignalKind.WIFI_SSID_HINT ->
            AtlasSignalKind.WIFI_AP in observedKinds || AtlasSignalKind.WIFI_SSID_HINT in observedKinds
        else -> kind in observedKinds
    }

    private fun retireRelation(label: LabelProfile, signalKey: String) {
        label.signals.remove(signalKey) ?: return
        val profile = signals[signalKey] ?: return
        profile.labelIds.remove(label.id)
        if (profile.labelIds.isEmpty()) signals.remove(signalKey)
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
            for (signalKey in drop) {
                signals.remove(signalKey)
                labels.values.forEach { it.signals.remove(signalKey) }
            }
        }
    }

    private fun removeLabel(labelId: String) {
        val removed = labels.remove(labelId) ?: return
        for (signalKey in removed.signals.keys) {
            val sp = signals[signalKey] ?: continue
            sp.labelIds.remove(labelId)
            if (sp.labelIds.isEmpty()) signals.remove(signalKey)
        }
    }

    private fun validWall(raw: String, nowWallMs: Long): Long? = raw.toLongOrNull()?.takeIf {
        it > 0L && (nowWallMs <= 0L || it <= nowWallMs + FUTURE_TOLERANCE_MS)
    }

    private fun key(kind: AtlasSignalKind, signalId: String) = "${kind.ordinal}:$signalId"
}
