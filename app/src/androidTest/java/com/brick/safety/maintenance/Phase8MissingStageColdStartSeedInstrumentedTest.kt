package com.brick.safety.maintenance

import android.content.Context
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.io.File

/**
 * P8C-013 full preferences-file-loss original reproducer. The separate noBackup origin marker
 * must still stop Brick after a subsequent process cold start. Disposable emulator only.
 */
class Phase8MissingStageColdStartSeedInstrumentedTest : BrickInstrumentationTestCase() {
    fun testEntireDeprovisionStageFileDisappearsButGuardSurvives() {
        val app = instrumentation.targetContext.applicationContext
        val authorised = DeprovisionManager.authoriseFreeze(app)
        assertTrue(authorised.detail, authorised.ok)
        val guard = DeprovisionManager.originGuardFile(app)
        assertTrue("independent noBackup provenance not durable", guard.exists())

        // Simulate a device that had already progressed to PURGE_BRICK before the single
        // stage XML was corrupted/removed, keeping the separately held provenance anchor.
        assertTrue(app.getSharedPreferences("brick_deprovision_v1", Context.MODE_PRIVATE).edit()
            .putString("stage", DeprovisionManager.Stage.PURGE_BRICK.name)
            .putBoolean("deprovisionEverStarted", true)
            .commit())
        assertTrue(app.deleteSharedPreferences("brick_deprovision_v1"))
        assertEquals(DeprovisionManager.Stage.INVALID, DeprovisionManager.stage(app))
        assertTrue(DeprovisionManager.isPostPurge(app))

        listOf(
            "brick", "brick_position", "brick_activity", "brick_companion_presence",
            "brick_diagnostics", "brick_deep_off_v1", "brick_wifi_schedule_v1",
            "brick_device_role_v1", "brick_ble_anchors"
        ).forEach(app::deleteSharedPreferences)
        listOf("brick_diagnostics.db", "brick_journal.db", "brick_evidence.db")
            .forEach(app::deleteDatabase)
        listOf("brick_phase3_state.bin", "brick_phase3_state.bin.new",
            "brick_phase3_state.bin.bak", "brick_atlas_v1.bin",
            "brick_learned_places_v1.bin").forEach { File(app.filesDir, it).delete() }

        assertFalse("corrupted stage XML still present", File(app.applicationInfo.dataDir,
            "shared_prefs/brick_deprovision_v1.xml").exists())
        assertTrue("independent guard was accidentally erased", guard.exists())
    }
}
