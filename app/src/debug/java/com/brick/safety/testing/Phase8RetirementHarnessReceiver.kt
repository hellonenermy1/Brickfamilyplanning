package com.brick.safety.testing

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.brick.safety.BuildConfig
import com.brick.safety.beta.BetaSafety

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
        if (!BuildConfig.DEBUG || !(BuildConfig.BRICK_BETA || BuildConfig.BRICK_BETA_DIAGNOSTICS) || intent.action != ACTION_DISARM) {
            resultCode = Activity.RESULT_CANCELED
            resultData = "rejected"
            return
        }

        val app = context.applicationContext
        val committed = BetaSafety.beginRetirement(app, "ci_device_owner_reboot_boundary")
        val stage = BetaSafety.retirementStage(app)
        val ok = committed && stage == BetaSafety.RetirementStage.DISARMED

        Log.i(TAG, "stage1 committed=$committed stage=$stage")
        resultCode = if (ok) Activity.RESULT_OK else Activity.RESULT_CANCELED
        resultData = stage.name
    }

    companion object {
        const val ACTION_DISARM = "com.brick.safety.testing.PHASE8_DISARM"
        private const val TAG = "BrickP8Harness"
    }
}
