package com.brick.safety.fusion

import com.brick.safety.atlas.AtlasMatchCandidate
import com.brick.safety.atlas.AtlasRuntimeSnapshot
import com.brick.safety.location.PositionQuality
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.io.File

class Phase5LearnedPlaceRuntimeInstrumentedTest : BrickInstrumentationTestCase() {
    private val owner = "11111111-1111-4111-8111-111111111111"

    override fun setUp() {
        super.setUp()
        val context = instrumentation.targetContext
        context.getSharedPreferences("brick", 0).edit().putString("deviceId", owner).commit()
        File(context.filesDir, LearnedPlaceRegistry.FILE_NAME).delete()
        Phase5LearnedPlaceRuntime.initialize(context)
    }

    override fun tearDown() {
        val context = instrumentation.targetContext
        context.getSharedPreferences("brick", 0).edit().remove("deviceId").commit()
        File(context.filesDir, LearnedPlaceRegistry.FILE_NAME).delete()
        super.tearDown()
    }

    fun testSyncedLearnedPlaceActuallyFeedsUnifiedFusion() {
        val home = LearnedPlaceDefinition("home", "Home", 1.3000, 103.8000, 120f)
        assertTrue(Phase5LearnedPlaceRuntime.update(owner, listOf(home)))

        val now = android.os.SystemClock.elapsedRealtime().coerceAtLeast(10_000L)
        val atlas = AtlasRuntimeSnapshot(
            candidates = listOf(
                AtlasMatchCandidate(
                    labelId = "cell:home",
                    latitude = 1.3001,
                    longitude = 103.8001,
                    uncertaintyM = 55f,
                    supportWeight = 0.84,
                    matchedSignals = 5,
                    independenceGroups = 3,
                    negativePenalty = 0.01,
                    ambiguous = false
                )
            ),
            observedElapsedMs = now - 1_000L,
            providerStatuses = emptyMap()
        )

        val selection = Phase5PositionFusion().select(
            nowElapsedMs = now,
            phase3 = null,
            atlas = atlas,
            anchor = null,
            lastKnown = null
        )
        assertNotNull(selection)
        assertEquals(PositionQuality.ANCHORED, selection!!.result.state)
        assertTrue(selection.result.evidenceUsed.any { it.kind == FusionEvidenceKind.LEARNED_PLACE })
        assertEquals(1, selection.result.independenceGroups)
        assertTrue(selection.result.uncertaintyM >= home.radiusM)
    }

    fun testWrongOwnerCannotReplaceRuntimePlaceConfiguration() {
        val home = LearnedPlaceDefinition("home", "Home", 1.3000, 103.8000, 120f)
        assertTrue(Phase5LearnedPlaceRuntime.update(owner, listOf(home)))
        assertFalse(Phase5LearnedPlaceRuntime.update("22222222-2222-4222-8222-222222222222", emptyList()))
        assertEquals(1, Phase5LearnedPlaceRuntime.count())
    }
}
