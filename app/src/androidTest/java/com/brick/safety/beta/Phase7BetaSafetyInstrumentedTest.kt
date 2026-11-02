package com.brick.safety.beta

import android.content.pm.ApplicationInfo
import com.brick.safety.BuildConfig
import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase7BetaSafetyInstrumentedTest : BrickInstrumentationTestCase() {

    fun testPhase7BetaIsExplicitlyTestOnlyAndTimeBounded() {
        val context = instrumentation.targetContext
        val info = context.packageManager.getApplicationInfo(context.packageName, 0)

        assertTrue((info.flags and ApplicationInfo.FLAG_TEST_ONLY) != 0)
        assertTrue(BuildConfig.BRICK_BETA)
        assertTrue(BuildConfig.VERSION_NAME.contains("phase7"))
        assertTrue(BuildConfig.VERSION_NAME.contains("test"))

        val now = System.currentTimeMillis()
        assertTrue(BuildConfig.BRICK_BETA_EXPIRY_EPOCH_MS > now)
        assertTrue(
            "Beta expiry should stay intentionally short-lived",
            BuildConfig.BRICK_BETA_EXPIRY_EPOCH_MS - now <= 45L * 24L * 60L * 60L * 1000L
        )
    }
}
