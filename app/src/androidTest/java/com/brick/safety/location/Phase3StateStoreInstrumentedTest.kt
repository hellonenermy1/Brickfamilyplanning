package com.brick.safety.location

import com.brick.safety.testing.BrickInstrumentationTestCase
import java.io.File

@Suppress("DEPRECATION")
class Phase3StateStoreInstrumentedTest : BrickInstrumentationTestCase() {
    private val marker = "phase3-sensitive-route-marker-1.3000-103.8000"

    override fun setUp() {
        super.setUp()
        File(instrumentation.targetContext.filesDir, "brick_phase3_state.bin").delete()
        File(instrumentation.targetContext.filesDir, "brick_phase3_state.bin.bak").delete()
    }

    override fun tearDown() {
        File(instrumentation.targetContext.filesDir, "brick_phase3_state.bin").delete()
        File(instrumentation.targetContext.filesDir, "brick_phase3_state.bin.bak").delete()
        super.tearDown()
    }

    fun testStateRoundTripIsEncryptedAndAtomic() {
        val context = instrumentation.targetContext
        val store = Phase3StateStore(context)
        val state = Phase3PersistedState(
            odometry = "walk,hand,0.74",
            routeGraph = marker,
            magnetic = "mag-sequence",
            landmarks = "turn-stop",
            particles = "particles",
            lastMotionStepTotal = 1234L,
            lastMapRefreshWallMs = 1_700_000_000_000L,
            lastMapLatBits = 1.3000.toBits(),
            lastMapLonBits = 103.8000.toBits()
        )
        assertTrue(store.write(state))

        val raw = File(context.filesDir, "brick_phase3_state.bin").readBytes()
        assertTrue(raw.size > 12)
        assertFalse(raw.toString(Charsets.UTF_8).contains(marker))

        val restored = store.read()
        assertNotNull(restored)
        assertEquals(marker, restored!!.routeGraph)
        assertEquals(1234L, restored.lastMotionStepTotal)
        assertEquals(1_700_000_000_000L, restored.lastMapRefreshWallMs)
        assertTrue(context.getSharedPreferences("brick", 0).getBoolean("phase3StateHealthy", false))
    }

    fun testCorruptStateFailsClosedWithoutInventingPositioningState() {
        val context = instrumentation.targetContext
        val file = File(context.filesDir, "brick_phase3_state.bin")
        file.writeBytes("not-a-valid-encrypted-phase3-state".toByteArray())
        val before = context.getSharedPreferences("brick", 0).getLong("phase3StateFailureTotal", 0L)

        val restored = Phase3StateStore(context).read()
        assertNull(restored)
        assertFalse(file.exists())
        val prefs = context.getSharedPreferences("brick", 0)
        assertFalse(prefs.getBoolean("phase3StateHealthy", true))
        assertTrue(prefs.getLong("phase3StateFailureTotal", 0L) >= before + 1L)
    }

    fun testOversizedStateIsRejectedInsteadOfGrowingUnbounded() {
        val context = instrumentation.targetContext
        val store = Phase3StateStore(context)
        val oversized = "x".repeat(800 * 1024)
        val state = Phase3PersistedState(oversized, "", "", "", "", 0L, 0L, 0L, 0L)
        assertFalse(store.write(state))
        assertFalse(File(context.filesDir, "brick_phase3_state.bin").exists())
    }
}
