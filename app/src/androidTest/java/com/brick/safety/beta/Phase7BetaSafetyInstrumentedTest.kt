package com.brick.safety.beta

import android.content.pm.ApplicationInfo
import com.brick.safety.BuildConfig
import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase8BetaSafetyInstrumentedTest : BrickInstrumentationTestCase() {
    private val context get() = instrumentation.targetContext

    override fun setUp() {
        super.setUp()
        context.getSharedPreferences("brick_beta_safety", android.content.Context.MODE_PRIVATE)
            .edit().clear().commit()
    }

    fun testPhase8BetaIsExplicitlyTestOnlyAndTimeBounded() {
        val info = context.packageManager.getApplicationInfo(context.packageName, 0)
        assertTrue((info.flags and ApplicationInfo.FLAG_TEST_ONLY) != 0)
        assertTrue(BuildConfig.BRICK_BETA)
        assertTrue(BuildConfig.VERSION_NAME.contains("phase8"))
        assertTrue(BuildConfig.VERSION_NAME.contains("test"))
        val now = System.currentTimeMillis()
        assertTrue(BuildConfig.BRICK_BETA_EXPIRY_EPOCH_MS > now)
        assertTrue(BuildConfig.BRICK_BETA_EXPIRY_EPOCH_MS - now <= 45L * 24L * 60L * 60L * 1000L)
    }

    fun testRetirementIsMonotonicAndFailClosed() {
        assertEquals(BetaSafety.RetirementStage.ACTIVE, BetaSafety.retirementStage(context))
        assertTrue(BetaSafety.beginRetirement(context, "instrumentation"))
        assertEquals(BetaSafety.RetirementStage.DISARMED, BetaSafety.retirementStage(context))
        assertFalse(BetaSafety.isOperational(context))

        val release = BetaSafety.advanceManagementRelease(context)
        assertTrue(release.released)
        assertEquals(BetaSafety.RetirementStage.MANAGEMENT_RELEASED, BetaSafety.retirementStage(context))
        assertFalse(BetaSafety.isOperational(context))

        // Calling Stage 1 again can never move a retired build back toward ACTIVE.
        assertTrue(BetaSafety.beginRetirement(context, "repeat"))
        assertEquals(BetaSafety.RetirementStage.MANAGEMENT_RELEASED, BetaSafety.retirementStage(context))
    }
}
