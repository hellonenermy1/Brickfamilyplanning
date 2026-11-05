package com.brick.safety.testing

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.brick.safety.BuildConfig
import com.brick.safety.beta.BetaSafety
import com.brick.safety.maintenance.DeprovisionManager

/**
 * Debug/test-only entry point for the Phase 8 reboot acceptance harness.
 *
 * This deliberately avoids instrumentation for the Stage 1 -> reboot boundary. On Android 15,
 * normal instrumentation force-stops the target package, and stopped packages do not receive
 * BOOT_COMPLETED until they are explicitly unstopped. That would make the test alter the lifecycle
 * it is supposed to prove.
 */
class Phase8RetirementHarnessReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!BuildConfig.DEBUG || !(BuildConfig.BRICK_BETA || BuildConfig.BRICK_BETA_DIAGNOSTICS) ||
            (intent.action != ACTION_DISARM && intent.action != ACTION_AUTHORISE_REMOVAL)) {
            resultCode = Activity.RESULT_CANCELED
            resultData = "rejected"
            return
        }

        val app = context.applicationContext
        if (intent.action == ACTION_AUTHORISE_REMOVAL) {
            // Test the REAL five-stage deprovisioner, not only BetaSafety's legacy
            // disarm flow. Reboot immediately afterwards; Application/BootReceiver
            // must resume it without instrumentation or a user opening Brick.
            val result = DeprovisionManager.authoriseFreeze(app)
            val ok = result.ok && DeprovisionManager.stage(app) == DeprovisionManager.Stage.AUTHORISE_FREEZE
            Log.i(TAG, "deprovision authorised=$ok stage=${result.stage}")
            resultCode = if (ok) Activity.RESULT_OK else Activity.RESULT_CANCELED
            resultData = result.stage.name
            return
        }
        val committed = BetaSafety.beginRetirement(app, "ci_device_owner_reboot_boundary")
        val stage = BetaSafety.retirementStage(app)
        val ok = committed && stage == BetaSafety.RetirementStage.DISARMED

        Log.i(TAG, "stage1 committed=$committed stage=$stage")
        resultCode = if (ok) Activity.RESULT_OK else Activity.RESULT_CANCELED
        resultData = stage.name
    }

    companion object {
        const val ACTION_DISARM = "com.brick.safety.testing.PHASE8_DISARM"
        const val ACTION_AUTHORISE_REMOVAL = "com.brick.safety.testing.PHASE8_AUTHORISE_REMOVAL"
        private const val TAG = "BrickP8Harness"
    }
}
