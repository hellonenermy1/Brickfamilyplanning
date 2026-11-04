package com.brick.safety.maintenance

import android.content.Context
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.io.File

/**
 * P8C-013 cold-process restart fixture. The caller force-stops this process, relaunches the
 * activity and independently asserts that the purged files were not recreated.
 *
 * Must run last, in an isolated pm-cleared emulator package. Never run on a real family phone.
 */
class Phase8CorruptStageColdStartSeedInstrumentedTest : BrickInstrumentationTestCase() {
    fun testStageCorruptionSurvivesIndependentProcessRestartWithoutFailOpen() {
        val app = instrumentation.targetContext.applicationContext
        // Simulate interrupted/corrupt deprovision metadata, after a purge of application stores.
        assertTrue(app.getSharedPreferences("brick_deprovision_v1", Context.MODE_PRIVATE).edit()
            .putBoolean("deprovisionEverStarted", true)
            .putString("stage", "BAD_STAGE_UNRECOGNIZED")
            .putLong("updatedAtMs", System.currentTimeMillis())
            .commit())
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

        // Preserve only the intentionally corrupted deprovision metadata for the next process.
        val stageFile = File(app.applicationInfo.dataDir, "shared_prefs/brick_deprovision_v1.xml")
        assertTrue("deprovision stage was not durable", stageFile.exists())
        assertEquals(DeprovisionManager.Stage.INVALID, DeprovisionManager.stage(app))
    }
}
