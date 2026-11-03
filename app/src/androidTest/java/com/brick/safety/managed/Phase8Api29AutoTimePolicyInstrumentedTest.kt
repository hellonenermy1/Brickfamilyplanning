package com.brick.safety.managed

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import com.brick.safety.maintenance.DeprovisionManager
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.maintenance.PolicyLedger
import com.brick.safety.testing.BrickInstrumentationTestCase

/**
 * P8C-009 real API-29 regression. This class is executed only by the dedicated Android 10 Device
 * Owner workflow because setAutoTimeRequired() is the pre-Android-11 branch that API 35 cannot run.
 */
@Suppress("DEPRECATION")
class Phase8Api29AutoTimePolicyInstrumentedTest : BrickInstrumentationTestCase() {
    private lateinit var context: Context
    private lateinit var dpm: DevicePolicyManager
    private lateinit var admin: ComponentName

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        dpm = context.getSystemService(DevicePolicyManager::class.java)
        admin = ComponentName(context, BrickDeviceAdminReceiver::class.java)
    }

    fun testApi29AutoTimeRequiredIsProvenancedAndRestoredBeforeOwnerRelease() {
        assertEquals("dedicated P8C-009 gate must run on Android 10", Build.VERSION_CODES.Q, Build.VERSION.SDK_INT)
        assertTrue("Brick must be real Device Owner for this regression", dpm.isDeviceOwnerApp(context.packageName))
        assertTrue(dpm.isAdminActive(admin))

        // Test-only baseline: establish a known pre-Brick state, then start a clean explicit Brick
        // provenance lifecycle. The direct baseline write is not a production Brick policy mutation.
        dpm.setAutoTimeRequired(admin, false)
        assertFalse("test baseline must be false", dpm.getAutoTimeRequired())
        assertTrue(context.getSharedPreferences("brick_deprovision_v1", Context.MODE_PRIVATE).edit().clear().commit())
        assertTrue(context.getSharedPreferences("brick_deep_off_v1", Context.MODE_PRIVATE).edit().clear().commit())
        assertTrue(PolicyLedger.clear(context))
        assertTrue(PolicyLedger.initializeManagedLifecycle(context))
        assertTrue(PolicyLedger.integrityValid(context))

        assertTrue("ManagedPolicy should recognize Device Owner", ManagedPolicy.apply(context))
        assertTrue("Brick API29 policy must require automatic time", dpm.getAutoTimeRequired())

        val entry = PolicyLedger.active(context).singleOrNull { it.policy == "auto_time_required" }
        assertNotNull("API29 auto-time mutation must have durable provenance", entry)
        assertEquals("false", entry!!.previousValue)
        assertEquals("true", entry.brickValue)
        assertEquals("base_time_integrity_api29", entry.source)

        // Exercise the public production deprovision sequence rather than a private helper. The
        // policy reversal happens before BetaSafety relinquishes Device Owner.
        val authorised = DeprovisionManager.authoriseFreeze(context)
        assertTrue(authorised.detail, authorised.ok)
        val quiesced = DeprovisionManager.quiesce(context)
        assertTrue(quiesced.detail, quiesced.ok)
        assertTrue(DeepOffManager.isActive(context))

        val released = DeprovisionManager.undoDeviceManagement(context)
        assertTrue(released.detail, released.ok)
        assertFalse("Device Owner must be released", dpm.isDeviceOwnerApp(context.packageName))
        assertFalse("API29 auto-time requirement must be restored to the pre-Brick false state", dpm.getAutoTimeRequired())
        assertTrue("all policy provenance should be marked reverted", PolicyLedger.active(context).isEmpty())
    }
}
