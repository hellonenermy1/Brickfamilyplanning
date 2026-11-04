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
            val observed = WifiScheduleManager.awaitWifiState(wifi, target, timeoutMs = 1_000L)
            assertEquals("production completion must be based on actual Wi-Fi state: $result", target, result.actualEnabled)
            assertEquals("Android must show the actual target state: $result", target, observed)
            assertEquals("a command is not complete until the platform confirms it: $result", "completed", result.status)
            val persisted = WifiScheduleManager.lastResult(app)
            assertNotNull("one-shot outcome must be durably recorded", persisted)
            assertEquals(target, persisted!!.actualEnabled)
            assertEquals("completed", persisted.status)
        }

        try {
            verifyTransition(!initiallyEnabled, "p8c-api29-one-shot-first")
            verifyTransition(initiallyEnabled, "p8c-api29-one-shot-restore")
        } finally {
            // Keep the emulator's original Wi-Fi state for the subsequent Device Owner release
            // test, even when the first transition fails.
            runCatching { wifi.setWifiEnabled(initiallyEnabled) }
            WifiScheduleManager.awaitWifiState(wifi, initiallyEnabled, timeoutMs = 5_000L)
            WifiScheduleManager.updateSchedules(app, emptyList())
        }
    }
}
