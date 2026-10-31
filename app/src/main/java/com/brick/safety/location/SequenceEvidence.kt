package com.brick.safety.location

import kotlin.math.*

data class SequenceSupport(val segmentId: String, val strength: Double)

private data class MagFeature(val x: Float, val y: Float, val z: Float, val m: Float, val g: Float)
private data class MagSignature(
    val segmentId: String,
    val headingBin: Int,
    val features: List<MagFeature>,
    val repeats: Int,
    val lastSeenWallMs: Long
)

/**
 * Magnetic evidence is sequence-only. Uniform/global field readings are intentionally discarded;
 * only repeated, orientation-corrected local variation can support a route segment.
 */
class MagneticSequenceModel(private val maxSignatures: Int = 256) {
    private val signatures = linkedMapOf<String, MagSignature>()

    fun observeTrusted(segmentId: String, headingDeg: Float?, points: List<MagneticPoint>, wallMs: Long): Boolean {
        val normalized = normalizedSequence(points) ?: return false
        val bin = headingBin(headingDeg)
        val key = "$segmentId@$bin"
        val old = signatures[key]
        val updated = if (old == null || old.features.size != normalized.size) {
            MagSignature(segmentId, bin, normalized, 1, wallMs)
        } else {
            val alpha = if (old.repeats < 3) 0.25f else 0.10f
            val merged = old.features.indices.map { i ->
                val a = old.features[i]; val b = normalized[i]
                MagFeature(
                    a.x * (1 - alpha) + b.x * alpha,
                    a.y * (1 - alpha) + b.y * alpha,
                    a.z * (1 - alpha) + b.z * alpha,
                    a.m * (1 - alpha) + b.m * alpha,
                    a.g * (1 - alpha) + b.g * alpha
                )
            }
            old.copy(features = merged, repeats = (old.repeats + 1).coerceAtMost(255), lastSeenWallMs = max(old.lastSeenWallMs, wallMs))
        }
        signatures[key] = updated
        trim()
        return true
    }

    fun match(headingDeg: Float?, points: List<MagneticPoint>): List<SequenceSupport> {
        val candidate = normalizedSequence(points) ?: return emptyList()
        val bin = headingBin(headingDeg)
        val best = mutableMapOf<String, Double>()
        for (signature in signatures.values) {
            if (signature.repeats < 2 || signature.features.size != candidate.size) continue
            if (bin >= 0 && signature.headingBin >= 0) {
                val d = min(abs(bin - signature.headingBin), 8 - abs(bin - signature.headingBin))
                if (d > 1) continue
            }
            var sum = 0.0
            for (i in candidate.indices) {
                val a = candidate[i]; val b = signature.features[i]
                val dx = (a.x - b.x) / 8.0
                val dy = (a.y - b.y) / 8.0
                val dz = (a.z - b.z) / 8.0
                val dm = (a.m - b.m) / 6.0
                val dg = (a.g - b.g) / 10.0
                sum += dx * dx + dy * dy + dz * dz + dm * dm + dg * dg * 0.5
            }
            val distance = sqrt(sum / candidate.size)
            if (distance > 1.25) continue
            val repeatFactor = (signature.repeats / 4.0).coerceIn(0.35, 1.0)
            val strength = ((1.25 - distance) / 1.25 * repeatFactor).coerceIn(0.0, 1.0)
            if (strength >= 0.18) best[signature.segmentId] = max(best[signature.segmentId] ?: 0.0, strength)
        }
        return best.map { SequenceSupport(it.key, it.value) }.sortedByDescending { it.strength }.take(8)
    }

    private fun normalizedSequence(points: List<MagneticPoint>): List<MagFeature>? {
        if (points.size < 6) return null
        val sorted = points.sortedBy { it.elapsedNs }
        val duration = sorted.last().elapsedNs - sorted.first().elapsedNs
        if (duration < 2_000_000_000L || duration > 20_000_000_000L) return null
        val sampled = (0 until 6).map { i -> sorted[(i * (sorted.size - 1) / 5.0).roundToInt().coerceIn(0, sorted.lastIndex)] }
        val mx = sampled.map { it.eastUt }.average().toFloat()
        val my = sampled.map { it.northUt }.average().toFloat()
        val mz = sampled.map { it.upUt }.average().toFloat()
        val mm = sampled.map { it.magnitudeUt }.average().toFloat()
        val features = sampled.map { p -> MagFeature(p.eastUt - mx, p.northUt - my, p.upUt - mz, p.magnitudeUt - mm, p.gradientUtPerSec) }
        val spatialEnergy = sqrt(features.sumOf { (it.x * it.x + it.y * it.y + it.z * it.z + it.m * it.m).toDouble() } / features.size)
        val gradientEnergy = sqrt(features.sumOf { (it.g * it.g).toDouble() } / features.size)
        // Common smooth geomagnetic field is not distinctive enough to be a location clue.
        if (spatialEnergy < 1.6 && gradientEnergy < 1.8) return null
        return features
    }

    fun encode(): String = signatures.values.joinToString(";") { s ->
        val fs = s.features.joinToString("/") { f -> "${f.x},${f.y},${f.z},${f.m},${f.g}" }
        "${s.segmentId}|${s.headingBin}|${s.repeats}|${s.lastSeenWallMs}|$fs"
    }

    fun restore(encoded: String?) {
        signatures.clear()
        if (encoded.isNullOrBlank()) return
        for (token in encoded.split(';').takeLast(maxSignatures)) {
            val p = token.split('|')
            if (p.size != 5) continue
            val segmentId = p[0].takeIf { it.length in 3..120 } ?: continue
            val bin = p[1].toIntOrNull()?.takeIf { it in -1..7 } ?: continue
            val repeats = p[2].toIntOrNull()?.coerceIn(1, 255) ?: continue
            val wall = p[3].toLongOrNull()?.coerceAtLeast(0L) ?: continue
            val fs = p[4].split('/').mapNotNull { value ->
                val v = value.split(',')
                if (v.size != 5) return@mapNotNull null
                val nums = v.map { it.toFloatOrNull() }
                if (nums.any { it == null || !it.isFinite() }) return@mapNotNull null
                MagFeature(nums[0]!!, nums[1]!!, nums[2]!!, nums[3]!!, nums[4]!!)
            }
            if (fs.size != 6) continue
            signatures["$segmentId@$bin"] = MagSignature(segmentId, bin, fs, repeats, wall)
        }
        trim()
    }

    private fun headingBin(heading: Float?): Int = heading?.takeIf { it.isFinite() }?.let { ((GeoMath.normalizeDegrees(it.toDouble()) / 45.0).roundToInt() % 8) } ?: -1

    private fun trim() {
        if (signatures.size <= maxSignatures) return
        val keep = signatures.values.sortedWith(compareByDescending<MagSignature> { it.repeats }.thenByDescending { it.lastSeenWallMs }).take(maxSignatures)
        signatures.clear()
        keep.forEach { signatures["${it.segmentId}@${it.headingBin}"] = it }
    }
}

private data class LandmarkSignature(
    val segmentId: String,
    val kinds: List<LandmarkKind>,
    val repeats: Int,
    val lastSeenWallMs: Long
)

/** Single bumps/turns never anchor position; only repeated multi-event sequences can support a route. */
class LandmarkSequenceModel(private val maxSignatures: Int = 256) {
    private val signatures = linkedMapOf<String, LandmarkSignature>()

    fun observeTrusted(segmentId: String, events: List<LandmarkEvent>, wallMs: Long): Boolean {
        val sequence = compact(events) ?: return false
        val key = "$segmentId@${sequence.joinToString(".") { it.ordinal.toString() }}"
        val old = signatures[key]
        signatures[key] = if (old == null) LandmarkSignature(segmentId, sequence, 1, wallMs)
        else old.copy(repeats = (old.repeats + 1).coerceAtMost(255), lastSeenWallMs = max(old.lastSeenWallMs, wallMs))
        trim()
        return true
    }

    fun match(events: List<LandmarkEvent>): List<SequenceSupport> {
        val candidate = compact(events) ?: return emptyList()
        val best = mutableMapOf<String, Double>()
        for (signature in signatures.values) {
            if (signature.repeats < 2) continue
            val score = sequenceSimilarity(candidate, signature.kinds)
            if (score < 0.72) continue
            val repeatFactor = (signature.repeats / 4.0).coerceIn(0.35, 1.0)
            val support = ((score - 0.65) / 0.35 * repeatFactor).coerceIn(0.0, 1.0)
            if (support >= 0.18) best[signature.segmentId] = max(best[signature.segmentId] ?: 0.0, support)
        }
        return best.map { SequenceSupport(it.key, it.value) }.sortedByDescending { it.strength }.take(8)
    }

    private fun compact(events: List<LandmarkEvent>): List<LandmarkKind>? {
        if (events.size < 3) return null
        val sorted = events.sortedBy { it.elapsedNs }
        val duration = sorted.last().elapsedNs - sorted.first().elapsedNs
        if (duration !in 1_000_000_000L..90_000_000_000L) return null
        val kinds = sorted.map { it.kind }.fold(ArrayList<LandmarkKind>()) { acc, kind ->
            if (acc.lastOrNull() != kind) acc += kind
            acc
        }.takeLast(6)
        return kinds.takeIf { it.size >= 3 }
    }

    private fun sequenceSimilarity(a: List<LandmarkKind>, b: List<LandmarkKind>): Double {
        val n = a.size; val m = b.size
        val dp = Array(n + 1) { IntArray(m + 1) }
        for (i in 1..n) for (j in 1..m) {
            dp[i][j] = if (a[i - 1] == b[j - 1]) dp[i - 1][j - 1] + 1 else max(dp[i - 1][j], dp[i][j - 1])
        }
        return dp[n][m].toDouble() / max(n, m).coerceAtLeast(1)
    }

    fun encode(): String = signatures.values.joinToString(";") { s ->
        "${s.segmentId}|${s.repeats}|${s.lastSeenWallMs}|${s.kinds.joinToString(",") { it.ordinal.toString() }}"
    }

    fun restore(encoded: String?) {
        signatures.clear()
        if (encoded.isNullOrBlank()) return
        for (token in encoded.split(';').takeLast(maxSignatures)) {
            val p = token.split('|')
            if (p.size != 4) continue
            val segmentId = p[0].takeIf { it.length in 3..120 } ?: continue
            val repeats = p[1].toIntOrNull()?.coerceIn(1, 255) ?: continue
            val wall = p[2].toLongOrNull()?.coerceAtLeast(0L) ?: continue
            val kinds = p[3].split(',').mapNotNull { LandmarkKind.entries.getOrNull(it.toIntOrNull() ?: -1) }
            if (kinds.size < 3 || kinds.size > 6) continue
            val key = "$segmentId@${kinds.joinToString(".") { it.ordinal.toString() }}"
            signatures[key] = LandmarkSignature(segmentId, kinds, repeats, wall)
        }
        trim()
    }

    private fun trim() {
        if (signatures.size <= maxSignatures) return
        val keep = signatures.values.sortedWith(compareByDescending<LandmarkSignature> { it.repeats }.thenByDescending { it.lastSeenWallMs }).take(maxSignatures)
        signatures.clear()
        keep.forEach { s -> signatures["${s.segmentId}@${s.kinds.joinToString(".") { it.ordinal.toString() }}"] = s }
    }
}
