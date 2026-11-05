package com.brick.safety.beta

import android.content.Context
import com.brick.safety.crypto.DeviceKeys
import com.brick.safety.maintenance.DeprovisionManager
import com.brick.safety.testing.BrickInstrumentationTestCase

/** One isolated emulator process; irreversible fixture purge is intentional, never runs on end-user phone. */
class BetaPostPurgeInstrumentedTest : BrickInstrumentationTestCase() {
    fun testNewBetaStateIsPurgedAndCannotReappear() {
        val c: Context = instrumentation.targetContext.applicationContext
        DeviceKeys.initialize(c)
        BetaDiagnostics.summary(c)
        assertTrue(c.getDatabasePath("brick_beta_readiness.db").exists())
        assertTrue(DeprovisionManager.authoriseFreeze(c).ok)
        assertTrue(DeprovisionManager.quiesce(c).ok)
        val release=DeprovisionManager.undoDeviceManagement(c)
        assertTrue(release.detail,release.ok)
        val purge=DeprovisionManager.purgeBrick(c)
        assertTrue(purge.detail,purge.ok)
        assertFalse(c.getDatabasePath("brick_beta_readiness.db").exists())
        try { BetaDiagnostics.summary(c); fail("post-purge beta store reopened") } catch (_: IllegalStateException) { }
        assertFalse(c.getDatabasePath("brick_beta_readiness.db").exists())
    }
}
