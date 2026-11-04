package com.brick.safety.maintenance

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.net.wifi.WifiManager
import com.brick.safety.testing.BrickInstrumentationTestCase

/**
 * P8C-003: verify an actual Android 10 Device Owner one-shot Wi-Fi transition.
 * Unlike the previous zero-timeout helper tests, this calls the production schedule executor
 * and requires Android's observed state to match the commanded target before reporting success.
 */
@Suppress("DEPRECATION")
class Phase8Api29WifiDeviceOwnerInstrumentedTest : BrickInstrumentationTestCase() {
    fun testActualDeviceOwnerOneShotWifiTransitionsAreConfirmedByObservedState() {
        val app = instrumentation.targetContext.applicationContext
        val dpm = app.getSystemService(DevicePolicyManager::class.java)
        val wifi = app.getSystemService(WifiManager::class.java)
        assertTrue("This test requires real Device Owner provisioning", dpm.isDeviceOwnerApp(app.packageName))
        val initiallyEnabled = wifi.isWifiEnabled

        fun verifyTransition(target: Boolean, id: String) {
            assertTrue(WifiScheduleManager.updateSchedules(app, listOf(
                WifiScheduleManager.Schedule(
                    id = id,
                    enabled = true,
                    targetEnabled = target,
                    localMinuteOfDay = 0,
                    daysMask = 127,
                    graceMinutes = 15
                )
            )))
            val result = WifiScheduleManager.execute(app, id, System.currentTimeMillis())
            val observed = wifi.isWifiEnabled
            val persisted = WifiScheduleManager.lastResult(app)
            assertNotNull("one-shot outcome must be durably recorded", persisted)
            assertEquals("persisted target changed", target, persisted!!.targetEnabled)
            assertEquals("persisted actual state diverges from Android", observed, persisted.actualEnabled)
            assertEquals("result actual state diverges from Android", observed, result.actualEnabled)
            assertEquals("persisted completion state diverges", result.status, persisted.status)
            if (result.detail == "platform_rejected_request") {
                // WIFICTL-002 explicitly says control is permitted only where tested hardware
                // supports the Device Owner API. AOSP API29 can reject even a true DO.
                // Verified refusal is a valid capability finding, NOT a successful Wi-Fi toggle.
                assertEquals("failed", result.status)
                assertEquals("rejected request must not change Wi-Fi", !target, observed)
                assertEquals("platform_rejected_request", persisted.detail)
                app.filesDir.resolve("phase8_api29_wifi_capability.txt").writeText(
                    "VERIFIED_UNSUPPORTED_ANDROID10_EMULATOR target=$target actual=$observed status=${result.status} detail=${result.detail}\\n"
                )
                return false
            }
            assertEquals("actual platform Wi-Fi state never reached requested target: $result", target, observed)
            assertEquals("a command is not complete until the platform confirms it: $result", "completed", result.status)
            assertEquals("device_owner_one_shot_confirmed", result.detail)
            return true
        }

        try {
            val transitioned = verifyTransition(!initiallyEnabled, "p8c-api29-one-shot-first")
            if (transitioned) {
                assertTrue("supported actuator failed to restore original Wi-Fi",
                    verifyTransition(initiallyEnabled, "p8c-api29-one-shot-restore"))
                app.filesDir.resolve("phase8_api29_wifi_capability.txt").writeText(
                    "SUPPORTED_ANDROID10_EMULATOR verified_actual_on_off_and_restore\\n"
                )
            }
        } finally {
            // Keep the emulator's original Wi-Fi state for the subsequent Device Owner release
            // test, even when the first transition fails.
            runCatching { wifi.setWifiEnabled(initiallyEnabled) }
            WifiScheduleManager.awaitWifiState(wifi, initiallyEnabled, timeoutMs = 5_000L)
            WifiScheduleManager.updateSchedules(app, emptyList())
        }
    }
}
