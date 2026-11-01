package com.brick.safety.fusion

import android.content.Context
import android.os.SystemClock
import com.brick.safety.activity.ActivityMode
import com.brick.safety.evidence.EvidenceFamily
import com.brick.safety.evidence.EvidenceJournal
import com.brick.safety.evidence.EvidenceObservation
import com.brick.safety.evidence.EvidenceProviderId
import com.brick.safety.evidence.EvidenceQuality
import com.brick.safety.evidence.ProviderCapability
import com.brick.safety.evidence.ProviderHealth
import com.brick.safety.reliability.RecoveryScheduler
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt

/**
 * Persists the alternatives that actually existed during degraded fusion. These frames use the
 * Phase 2 encrypted EvidenceJournal and exact ACK path; they never change the live 90-byte packet.
 * The server can later rerank them after a trustworthy endpoint returns without rewriting raw or
 * realtime history.
 */
class Phase5HypothesisRecorder(context: Context) {
    companion object {
        private const val MIN_RECORD_GAP_MS = 15_000L
        private const val MAX_HYPOTHESES = 10
    }

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)
    private val journal = EvidenceJournal(appContext)
    @Volatile private var lastRecordedElapsedMs = 0L

    @Synchronized
    fun record(selection: Phase5FusionSelection, activity: ActivityMode, nowElapsedMs: Long = SystemClock.elapsedRealtime()): Boolean {
        if (nowElapsedMs <= 0L || selection.result.computedElapsedMs > nowElapsedMs) return false
        if (lastRecordedElapsedMs > 0L && nowElapsedMs >= lastRecordedElapsedMs && nowElapsedMs - lastRecordedElapsedMs < MIN_RECORD_GAP_MS) return false
        val deviceId = prefs.getString("deviceId", null)?.takeIf { it.isNotBlank() } ?: return false
        val epoch = prefs.getInt("epoch", 1).coerceAtLeast(0)
        val hypotheses = selection.storedHypotheses.take(MAX_HYPOTHESES)
        if (hypotheses.isEmpty()) return false

        val array = JSONArray()
        for (h in hypotheses) {
            val uncertaintyCm = (h.uncertaintyM.toDouble() * 100.0).roundToInt().coerceIn(100, 5_000_000)
            array.put(
                JSONObject()
                    .put("id", h.id)
                    .put("latE7", (h.latitude * 10_000_000.0).roundToInt())
                    .put("lonE7", (h.longitude * 10_000_000.0).roundToInt())
                    .put("uCm", uncertaintyCm)
                    .put("rw", (h.realtimeWeight * 1_000.0).roundToInt().coerceIn(0, 1_000))
                    .put("ew", (h.storedEvidenceWeight * 1_000.0).roundToInt().coerceIn(0, 1_000))
                    .put("s", h.source.take(48))
            )
        }
        val payload = JSONObject()
            .put("v", 1)
            .put("t", "h")
            .put("o", selection.originalRealtimeHypothesisId)
            .put("m", maxSpeedMps(activity))
            .put("h", array)
            .toString()
            .toByteArray(Charsets.UTF_8)

        val quality = when (selection.result.confidenceBand) {
            FusionConfidenceBand.HIGH -> EvidenceQuality.HIGH
            FusionConfidenceBand.MEDIUM -> EvidenceQuality.MEDIUM
            FusionConfidenceBand.LOW, FusionConfidenceBand.VERY_LOW -> EvidenceQuality.LOW
        }
        val observation = runCatching {
            EvidenceObservation(
                elapsedRealtimeMs = nowElapsedMs,
                wallTimeMs = System.currentTimeMillis(),
                provider = EvidenceProviderId.FUSION_HYPOTHESES,
                family = EvidenceFamily.POSITION,
                independenceGroup = "fusion.hypotheses",
                capability = ProviderCapability.SUPPORTED,
                health = ProviderHealth.HEALTHY,
                quality = quality,
                payload = payload
            )
        }.getOrNull() ?: return false

        val record = runCatching { journal.appendNew(deviceId, epoch, observation) }.getOrNull() ?: return false
        lastRecordedElapsedMs = nowElapsedMs
        runCatching { RecoveryScheduler.scheduleEvidenceSoon(appContext, 5) }
        return record.sequence > 0L
    }

    private fun maxSpeedMps(mode: ActivityMode): Int = when (mode) {
        ActivityMode.STATIONARY -> 2
        ActivityMode.WALKING -> 4
        ActivityMode.RUNNING -> 8
        ActivityMode.BICYCLE -> 18
        ActivityMode.VEHICLE -> 60
        // No activity is passed through the pure fusion boundary yet. Use the broad vehicle-safe
        // envelope rather than risk smoothing away a physically possible candidate.
        ActivityMode.UNKNOWN -> 60
    }
}
