package com.brick.safety.location

import android.content.Context
import android.location.Location
import android.os.SystemClock
import com.brick.safety.activity.ActivityMode
import com.brick.safety.activity.ActivitySnapshot
import com.brick.safety.testing.BrickInstrumentationTestCase

/** P8C-002: callback arrival time must never make an old/non-measured position look freshly fused. */
class Phase8FusedFreshnessInstrumentedTest : BrickInstrumentationTestCase() {
    private lateinit var context: Context
    private lateinit var motion: MotionEngine
    private lateinit var gnss: GnssQualityMonitor
    private lateinit var engine: PositionEngine

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        context.getSharedPreferences("brick_position", Context.MODE_PRIVATE).edit().clear().commit()
        context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit().clear().commit()
        context.filesDir.resolve("brick_phase3_state.bin").delete()
        motion = MotionEngine(context)
        gnss = GnssQualityMonitor(context)
        engine = PositionEngine(context, motion, gnss)
    }

    override fun tearDown() {
        runCatching { motion.stop() }
        runCatching { gnss.stop() }
        context.getSharedPreferences("brick_position", Context.MODE_PRIVATE).edit().clear().commit()
        context.filesDir.resolve("brick_phase3_state.bin").delete()
        super.tearDown()
    }

    fun testDelayedAcceptedFusedCallbackRetainsMeasurementAge() {
        val now = SystemClock.elapsedRealtime()
        val measuredElapsed = (now - 20_000L).coerceAtLeast(1L)
        val sample = engine.evaluate(
            location(measuredElapsed, 1.35210, 103.81980, 8f),
            ActivitySnapshot(ActivityMode.UNKNOWN, 0, now)
        )

        assertTrue("20-second-old but otherwise valid raw fix should remain a measured sample", sample.rawAccepted)
        assertEquals(PositionSource.FUSED, sample.source)
        assertEquals("service freshness must use measurement time, not callback arrival", measuredElapsed, sample.elapsedRealtimeMs)
        assertTrue("delayed callback must still be recognisably old", SystemClock.elapsedRealtime() - sample.elapsedRealtimeMs >= 19_000L)
    }

    fun testStaleRawCallbackCannotMasqueradeAsFreshFusedMeasurement() {
        val now = SystemClock.elapsedRealtime()
        val freshElapsed = (now - 1_000L).coerceAtLeast(1L)
        val fresh = engine.evaluate(
            location(freshElapsed, 1.35210, 103.81980, 8f),
            ActivitySnapshot(ActivityMode.UNKNOWN, 0, now)
        )
        assertTrue(fresh.rawAccepted)
        assertEquals(PositionSource.FUSED, fresh.source)

        // Android callback can arrive now while carrying an old underlying measurement. Position
        // Engine may still produce a conservative fallback from the previous trusted anchor, but it
        // must not label that fallback as an accepted fused measurement. BrickLocationService's
        // measured-freshness gate therefore cannot be refreshed by this callback.
        val staleElapsed = (SystemClock.elapsedRealtime() - 61_000L).coerceAtLeast(1L)
        val stale = engine.evaluate(
            location(staleElapsed, 1.35211, 103.81981, 20f),
            ActivitySnapshot(ActivityMode.UNKNOWN, 0, SystemClock.elapsedRealtime())
        )
        assertFalse(stale.rawAccepted)
        assertFalse("fallback/old callback must not be classified as fresh fused truth", stale.source == PositionSource.FUSED)
    }

    private fun location(elapsedMs: Long, lat: Double, lon: Double, accuracyM: Float) =
        Location("fused-test").apply {
            latitude = lat
            longitude = lon
            accuracy = accuracyM
            time = System.currentTimeMillis()
            elapsedRealtimeNanos = elapsedMs * 1_000_000L
        }
}
