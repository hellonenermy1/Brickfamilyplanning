package com.brick.safety.maintenance

import android.content.Context
import com.brick.safety.testing.BrickInstrumentationTestCase

/** P8C-013: unknown/deleted/malformed deprovision provenance must never re-enable Brick. */
class Phase8DeprovisionStageIntegrityInstrumentedTest : BrickInstrumentationTestCase() {
    private lateinit var context: Context
    private val prefs get() = context.getSharedPreferences("brick_deprovision_v1", Context.MODE_PRIVATE)

    private fun clearOriginGuard() {
        val base = DeprovisionManager.originGuardFile(context)
        listOf(base, java.io.File(base.path + ".new"), java.io.File(base.path + ".bak"))
            .forEach { it.delete() }
    }

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        context.deleteSharedPreferences("brick_deprovision_v1")
        clearOriginGuard()
    }

    override fun tearDown() {
        context.deleteSharedPreferences("brick_deprovision_v1")
        clearOriginGuard()
        super.tearDown()
    }

    fun testUninitializedFreshInstallStillStartsAtNone() {
        assertEquals(DeprovisionManager.Stage.NONE, DeprovisionManager.stage(context))
        assertFalse(DeprovisionManager.isPostPurge(context))
    }

    fun testUnknownStageFailsClosedAndCannotAdvanceOrUninstall() {
        assertTrue(prefs.edit().putString("stage", "invalid-stage-test").commit())
        assertEquals(DeprovisionManager.Stage.INVALID, DeprovisionManager.stage(context))
        assertTrue(DeprovisionManager.isPostPurge(context))
        assertFalse(DeprovisionManager.authoriseFreeze(context).ok)
        assertFalse(DeprovisionManager.quiesce(context).ok)
        assertFalse(DeprovisionManager.undoDeviceManagement(context).ok)
        assertFalse(DeprovisionManager.purgeBrick(context).ok)
        assertFalse(DeprovisionManager.uninstall(context).ok)
        assertEquals("invalid-stage-test", prefs.getString("stage", null))
    }

    fun testWrongTypedStageFailsClosedWithoutException() {
        assertTrue(prefs.edit().putInt("stage", 42).commit())
        assertEquals(DeprovisionManager.Stage.INVALID, DeprovisionManager.stage(context))
        assertTrue(DeprovisionManager.isPostPurge(context))
        assertFalse(DeprovisionManager.authoriseFreeze(context).ok)
    }

    fun testDeletedStageAfterPreviouslyStartedDeprovisionFailsClosed() {
        assertTrue(prefs.edit().putBoolean("deprovisionEverStarted", true).commit())
        assertEquals(DeprovisionManager.Stage.INVALID, DeprovisionManager.stage(context))
        assertTrue(DeprovisionManager.isPostPurge(context))
    }

    fun testNoninitialStageWithoutOriginMarkerFailsClosed() {
        assertTrue(prefs.edit().putString("stage", DeprovisionManager.Stage.PURGE_BRICK.name).commit())
        assertEquals(DeprovisionManager.Stage.INVALID, DeprovisionManager.stage(context))
        assertTrue(DeprovisionManager.isPostPurge(context))
        assertFalse(DeprovisionManager.uninstall(context).ok)
    }

    fun testStartingDeprovisionWritesMonotonicOriginMarker() {
        val result = DeprovisionManager.authoriseFreeze(context)
        assertTrue(result.detail, result.ok)
        assertEquals(DeprovisionManager.Stage.AUTHORISE_FREEZE, DeprovisionManager.stage(context))
        assertTrue(prefs.getBoolean("deprovisionEverStarted", false))
        assertTrue("separate no-backup origin marker missing", DeprovisionManager.originGuardFile(context).exists())
    }

    fun testEntireDeprovisionPreferenceFileLossStillFailsClosed() {
        assertTrue(DeprovisionManager.authoriseFreeze(context).ok)
        assertTrue(DeprovisionManager.originGuardFile(context).exists())
        assertTrue(context.deleteSharedPreferences("brick_deprovision_v1"))
        assertEquals(DeprovisionManager.Stage.INVALID, DeprovisionManager.stage(context))
        assertTrue(DeprovisionManager.isPostPurge(context))
        assertFalse(DeprovisionManager.authoriseFreeze(context).ok)
        assertFalse(DeprovisionManager.uninstall(context).ok)
    }

    fun testBadIndependentOriginGuardCannotBeSilentlyRepaired() {
        assertTrue(DeprovisionManager.authoriseFreeze(context).ok)
        DeprovisionManager.originGuardFile(context).writeText("WRONG GUARD")
        assertEquals(DeprovisionManager.Stage.INVALID, DeprovisionManager.stage(context))
        assertFalse(DeprovisionManager.purgeBrick(context).ok)
    }

    fun testInterruptedOriginGuardWriteWithoutStageFailsClosed() {
        val base = DeprovisionManager.originGuardFile(context)
        java.io.File(base.path + ".new").writeText("PARTIAL")
        assertEquals(DeprovisionManager.Stage.INVALID, DeprovisionManager.stage(context))
        assertTrue(DeprovisionManager.isPostPurge(context))
    }

    fun testLegacyOriginPreferenceMigratesWithoutLosingMonotonicity() {
        assertTrue(prefs.edit()
            .putBoolean("deprovisionEverStarted", true)
            .putString("stage", DeprovisionManager.Stage.AUTHORISE_FREEZE.name)
            .commit())
        assertEquals(DeprovisionManager.Stage.AUTHORISE_FREEZE, DeprovisionManager.stage(context))
        assertTrue("legacy migration must create independent guard", DeprovisionManager.originGuardFile(context).exists())
        context.deleteSharedPreferences("brick_deprovision_v1")
        assertEquals(DeprovisionManager.Stage.INVALID, DeprovisionManager.stage(context))
    }
}
