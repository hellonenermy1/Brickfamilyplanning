package com.brick.safety.maintenance

import android.content.Context
import android.content.Intent
import com.brick.safety.activity.ActivityMode
import com.brick.safety.activity.ActivityState
import com.brick.safety.atlas.CompanionPresenceStore
import com.brick.safety.reliability.BootReceiver
import com.brick.safety.reliability.FallDetectorRuntime
import com.brick.safety.diagnostics.DiagnosticMonitor
import com.brick.safety.reliability.RecoveryScheduler
import com.brick.safety.reliability.ServiceControl
import com.brick.safety.testing.BrickInstrumentationTestCase
import java.io.File

@Suppress("DEPRECATION")
class Phase8PostPurgeIsolationInstrumentedTest : BrickInstrumentationTestCase() {
    private lateinit var context: Context

    private val forbiddenPrefs = listOf(
        "brick",
        "brick_activity",
        "brick_companion_presence",
        "brick_deep_off_v1",
        "brick_diagnostics",
        "brick_diag_state",
        "brick_diag_flags",
        "brick_wifi_schedule_v1",
        "brick_device_role_v1"
    )

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        context.getSharedPreferences("brick_deprovision_v1", Context.MODE_PRIVATE).edit()
            .putString("stage", DeprovisionManager.Stage.PURGE_BRICK.name)
                .putBoolean("deprovisionEverStarted", true)
            .putLong("updatedAtMs", System.currentTimeMillis())
            .commit()
        forbiddenPrefs.forEach(context::deleteSharedPreferences)
        context.deleteDatabase("brick_diagnostics.db")
    }

    override fun tearDown() {
        context.deleteSharedPreferences("brick_deprovision_v1")
        forbiddenPrefs.forEach(context::deleteSharedPreferences)
        context.deleteDatabase("brick_diagnostics.db")
        super.tearDown()
    }

    fun testIndependentEntryPointsRemainInertAfterPurge() {
        assertTrue(DeprovisionManager.isPostPurge(context))
        assertTrue(DeepOffManager.isActive(context))

        ActivityState.write(context, ActivityMode.WALKING, 99)
        assertEquals(ActivityMode.UNKNOWN, ActivityState.read(context).mode)

        // The legacy companion path is important because privacy reduction would otherwise touch the
        // Atlas HMAC Keystore key before writing companion state.
        CompanionPresenceStore.noteLegacyAddress(context, "00:11:22:33:44:55", true)
        CompanionPresenceStore.noteAssociation(context, 123, true)

        RecoveryScheduler.ensureScheduled(context)
        RecoveryScheduler.scheduleSoon(context, 1)
        RecoveryScheduler.scheduleEvidenceSoon(context, 1)
        ServiceControl.ensureTracking(context)
        // A callback may call an auxiliary singleton directly even after Application.onCreate
        // was skipped. No standalone diagnostic/fall start or mirror update may recreate stores.
        repeat(5) {
            DiagnosticMonitor.start(context)
            FallDetectorRuntime.start(context)
            FallDetectorRuntime.refreshHighAlert(context)
            FallDetectorRuntime.clearHighAlert(context)
        }
        BootReceiver().onReceive(context, Intent(Intent.ACTION_BOOT_COMPLETED))
        BootReceiver().onReceive(context, Intent(Intent.ACTION_TIME_CHANGED))

        forbiddenPrefs.forEach { name ->
            assertFalse("post-purge preference recreated: $name", sharedPrefsFile(name).exists())
        }
        assertFalse("diagnostics database recreated", context.getDatabasePath("brick_diagnostics.db").exists())
    }

    private fun sharedPrefsFile(name: String): File =
        File(File(context.applicationInfo.dataDir, "shared_prefs"), "$name.xml")
}
