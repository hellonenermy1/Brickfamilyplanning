package com.brick.safety.beta

import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import com.brick.safety.BuildConfig
import com.brick.safety.location.BrickLocationService
import com.brick.safety.reliability.BootReceiver
import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase8BetaSafetyInstrumentedTest : BrickInstrumentationTestCase() {
    private val context get() = instrumentation.targetContext

    override fun setUp() {
        super.setUp()
        resetRetirementTestState()
    }

    override fun tearDown() {
        // Shared regression emulators must not inherit this test's deliberately retired state or the
        // package-manager kill switch. The dedicated Device Owner lifecycle job separately verifies
        // real ownership removal before uninstalling the package.
        resetRetirementTestState()
        super.tearDown()
    }

    private fun resetRetirementTestState() {
        context.getSharedPreferences("brick_beta_safety", Context.MODE_PRIVATE)
            .edit().clear().commit()
        val pm = context.packageManager
        listOf(
            ComponentName(context, BrickLocationService::class.java),
            ComponentName(context, BootReceiver::class.java)
        ).forEach { component ->
            runCatching {
                pm.setComponentEnabledSetting(
                    component,
                    PackageManager.COMPONENT_ENABLED_STATE_DEFAULT,
                    PackageManager.DONT_KILL_APP
                )
            }
        }
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

    fun testRetirementIsMonotonicFailClosedAndDisablesRestartComponents() {
        assertEquals(BetaSafety.RetirementStage.ACTIVE, BetaSafety.retirementStage(context))
        assertTrue(BetaSafety.beginRetirement(context, "instrumentation"))
        assertEquals(BetaSafety.RetirementStage.DISARMED, BetaSafety.retirementStage(context))
        assertFalse(BetaSafety.isOperational(context))

        val pm = context.packageManager
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            pm.getComponentEnabledSetting(ComponentName(context, BrickLocationService::class.java))
        )
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            pm.getComponentEnabledSetting(ComponentName(context, BootReceiver::class.java))
        )

        val release = BetaSafety.advanceManagementRelease(context)
        assertTrue(release.released)
        assertEquals(BetaSafety.RetirementStage.MANAGEMENT_RELEASED, BetaSafety.retirementStage(context))
        assertFalse(BetaSafety.isOperational(context))

        // Calling Stage 1 again can never move a retired build back toward ACTIVE.
        assertTrue(BetaSafety.beginRetirement(context, "repeat"))
        assertEquals(BetaSafety.RetirementStage.MANAGEMENT_RELEASED, BetaSafety.retirementStage(context))
    }
}
