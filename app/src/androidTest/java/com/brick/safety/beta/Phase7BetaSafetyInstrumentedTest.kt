package com.brick.safety.beta

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.UserManager
import com.brick.safety.BuildConfig
import com.brick.safety.location.BrickLocationService
import com.brick.safety.managed.BrickDeviceAdminReceiver
import com.brick.safety.managed.ManagedPolicy
import com.brick.safety.reliability.BootReceiver
import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase8BetaSafetyInstrumentedTest : BrickInstrumentationTestCase() {
    private val context get() = instrumentation.targetContext
    private fun externalMode(): String = instrumentation.arguments.getString("p8RetirementMode") ?: ""

    override fun setUp() {
        super.setUp()
        if (externalMode() != "verify") resetRetirementTestState()
    }

    override fun tearDown() {
        // The dedicated reboot test must leave Stage 1 durable across process exit/reboot. All normal
        // cumulative runs and the post-reboot verification clean up their test state.
        if (externalMode() != "disarm") resetRetirementTestState()
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

    fun testRetirementIsMonotonicFailClosedAndKeepsRecoveryReceiverAlive() {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(context, BrickDeviceAdminReceiver::class.java)
        if (dpm.isDeviceOwnerApp(context.packageName)) {
            // Reproduce the Phase 7 lock, then prove the Phase 8 migration actively removes it.
            dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION)
            assertTrue(dpm.getUserRestrictions(admin).getBoolean(UserManager.DISALLOW_CONFIG_LOCATION))
            ManagedPolicy.apply(context)
            assertFalse(dpm.getUserRestrictions(admin).getBoolean(UserManager.DISALLOW_CONFIG_LOCATION))
        }

        assertEquals(BetaSafety.RetirementStage.ACTIVE, BetaSafety.retirementStage(context))
        assertTrue(BetaSafety.beginRetirement(context, "instrumentation"))
        assertEquals(BetaSafety.RetirementStage.DISARMED, BetaSafety.retirementStage(context))
        assertFalse(BetaSafety.isOperational(context))

        val pm = context.packageManager
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            pm.getComponentEnabledSetting(ComponentName(context, BrickLocationService::class.java))
        )
        assertTrue(
            pm.getComponentEnabledSetting(ComponentName(context, BootReceiver::class.java)) !=
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        )

        val release = BetaSafety.advanceManagementRelease(context)
        assertTrue(release.released)
        assertEquals(BetaSafety.RetirementStage.MANAGEMENT_RELEASED, BetaSafety.retirementStage(context))
        assertFalse(BetaSafety.isOperational(context))

        // Calling Stage 1 again can never move a retired build back toward ACTIVE.
        assertTrue(BetaSafety.beginRetirement(context, "repeat"))
        assertEquals(BetaSafety.RetirementStage.MANAGEMENT_RELEASED, BetaSafety.retirementStage(context))
    }

    fun testUnknownPersistedStageFailsClosed() {
        context.getSharedPreferences("brick_beta_safety", Context.MODE_PRIVATE)
            .edit().putString("retirement_stage", "CORRUPT_STAGE").commit()
        assertEquals(BetaSafety.RetirementStage.DISARMED, BetaSafety.retirementStage(context))
        assertFalse(BetaSafety.isOperational(context))
    }

    /** Dedicated CI mode: persist Stage 1 and intentionally leave it in place for an external reboot. */
    fun testExternalRebootDisarm() {
        if (externalMode() != "disarm") return
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        assertTrue("Dedicated Phase 8 job must provision Brick as Device Owner", dpm.isDeviceOwnerApp(context.packageName))

        assertTrue(BetaSafety.beginRetirement(context, "ci_reboot_boundary"))
        assertEquals(BetaSafety.RetirementStage.DISARMED, BetaSafety.retirementStage(context))
        assertTrue("Stage 1 must not release management before the durable boundary", dpm.isDeviceOwnerApp(context.packageName))
        assertFalse(BetaSafety.isOperational(context))

        val pm = context.packageManager
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            pm.getComponentEnabledSetting(ComponentName(context, BrickLocationService::class.java))
        )
        assertTrue(
            pm.getComponentEnabledSetting(ComponentName(context, BootReceiver::class.java)) !=
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        )
    }

    /** Dedicated CI mode: after reboot, BootReceiver must have resumed Stage 2 without reviving Core. */
    fun testExternalRebootRecoveryAndStage3Request() {
        if (externalMode() != "verify") return
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(context, BrickDeviceAdminReceiver::class.java)

        assertFalse(dpm.isDeviceOwnerApp(context.packageName))
        assertFalse(dpm.isAdminActive(admin))
        assertEquals(BetaSafety.RetirementStage.MANAGEMENT_RELEASED, BetaSafety.retirementStage(context))
        assertFalse(BetaSafety.isOperational(context))
        assertEquals(
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            context.packageManager.getComponentEnabledSetting(ComponentName(context, BrickLocationService::class.java))
        )
        assertTrue(
            context.packageManager.getComponentEnabledSetting(ComponentName(context, BootReceiver::class.java)) !=
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        )

        assertTrue(BetaSafety.requestUninstall(context))
        assertEquals(BetaSafety.RetirementStage.UNINSTALL_REQUESTED, BetaSafety.retirementStage(context))
        // ACTION_DELETE only asks Android to show its uninstall UI. Without user confirmation the
        // package must still exist, proving Stage 3 cannot silently delete/wipe the app or phone.
        assertEquals(
            context.packageName,
            context.packageManager.getApplicationInfo(context.packageName, 0).packageName
        )
    }
}
