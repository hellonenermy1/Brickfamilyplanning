package com.brick.safety.fusion

import com.brick.safety.activity.ActivityMode
import com.brick.safety.evidence.EvidenceJournal
import com.brick.safety.evidence.EvidenceProviderId
import com.brick.safety.location.PositionQuality
import com.brick.safety.location.PositionSource
import com.brick.safety.testing.BrickInstrumentationTestCase
import org.json.JSONObject

class Phase5HypothesisRecorderInstrumentedTest : BrickInstrumentationTestCase() {
    private val deviceId = "33333333-3333-4333-8333-333333333333"

    override fun setUp() {
        super.setUp()
        val context = instrumentation.targetContext
        context.deleteDatabase(EvidenceJournal.DATABASE_NAME)
        context.getSharedPreferences("brick", 0).edit()
            .putString("deviceId", deviceId)
            .putInt("epoch", 7)
            .commit()
    }

    fun testHypothesisFrameIsEncryptedJournalEvidenceAndKeepsAlternatives() {
        val context = instrumentation.targetContext
        val now = android.os.SystemClock.elapsedRealtime().coerceAtLeast(10_000L)
        val result = FusionResult(
            latitude = 1.3000,
            longitude = 103.8000,
            uncertaintyM = 120f,
            state = PositionQuality.ESTIMATED,
            shape = FusionShapeKind.POSSIBLE_AREA,
            confidenceBand = FusionConfidenceBand.MEDIUM,
            evidenceUsed = emptyList(),
            conflicts = emptyList(),
            independenceGroups = 2,
            routeCandidateIds = emptyList(),
            computedElapsedMs = now
        )
        val selection = Phase5FusionSelection(
            result = result,
            speedMps = null,
            bearingDeg = null,
            stepDelta = 0,
            source = PositionSource.FUSION,
            originalRealtimeHypothesisId = "realtime",
            storedHypotheses = listOf(
                Phase5StoredHypothesis("realtime", 1.3000, 103.8000, 120f, 1.0, 1.0, "realtime_fusion"),
                Phase5StoredHypothesis("c:route-a", 1.3004, 103.8004, 90f, 0.7, 0.7, "route_geometry")
            )
        )

        val recorder = Phase5HypothesisRecorder(context)
        assertTrue(recorder.record(selection, ActivityMode.WALKING, now))

        EvidenceJournal(context).use { journal ->
            val pending = journal.nextPending(10)
            assertEquals(1, pending.size)
            val record = pending.single().record
            assertEquals(7, record.epoch)
            assertEquals(EvidenceProviderId.FUSION_HYPOTHESES, record.observation.provider)
            assertEquals("fusion.hypotheses", record.observation.independenceGroup)
            val payload = JSONObject(String(record.observation.payload, Charsets.UTF_8))
            assertEquals(1, payload.getInt("v"))
            assertEquals("h", payload.getString("t"))
            assertEquals("realtime", payload.getString("o"))
            assertEquals(4, payload.getInt("m"))
            assertEquals(2, payload.getJSONArray("h").length())
        }
    }

    fun testRecorderIsRateLimitedButDoesNotBreakFusion() {
        val context = instrumentation.targetContext
        val now = android.os.SystemClock.elapsedRealtime().coerceAtLeast(20_000L)
        val selection = Phase5FusionSelection(
            result = FusionResult(
                1.3, 103.8, 250f, PositionQuality.ESTIMATED, FusionShapeKind.POSSIBLE_AREA,
                FusionConfidenceBand.LOW, emptyList(), emptyList(), 1, emptyList(), now
            ),
            speedMps = null,
            bearingDeg = null,
            stepDelta = 0,
            source = PositionSource.FUSION,
            originalRealtimeHypothesisId = "realtime",
            storedHypotheses = listOf(Phase5StoredHypothesis("realtime", 1.3, 103.8, 250f, 1.0, 1.0, "realtime_fusion"))
        )
        val recorder = Phase5HypothesisRecorder(context)
        assertTrue(recorder.record(selection, ActivityMode.UNKNOWN, now))
        assertFalse(recorder.record(selection, ActivityMode.UNKNOWN, now + 1_000L))
    }
}
