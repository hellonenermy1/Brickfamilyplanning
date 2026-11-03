package com.brick.safety.maintenance

import android.content.Context
import android.net.wifi.WifiManager
import com.brick.safety.testing.BrickInstrumentationTestCase

/** P8C-003: schedule completion is based on observed Wi-Fi state, never the requested target. */
@Suppress("DEPRECATION")
class Phase8WifiVerificationInstrumentedTest : BrickInstrumentationTestCase() {
    private lateinit var context: Context

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
    }

    fun testVerificationReturnsObservedStateWhenTargetDoesNotMatch() {
        val wifi = context.getSystemService(WifiManager::class.java)
        val actualBefore = wifi.isWifiEnabled
        val oppositeTarget = !actualBefore

        // Zero timeout deliberately prevents this regression test from changing or waiting on Wi-Fi.
        // The verifier must report what Android actually says, not echo the requested target.
        val observed = WifiScheduleManager.awaitWifiState(wifi, oppositeTarget, timeoutMs = 0L)
        assertEquals(actualBefore, observed)
        assertFalse("verification must not fabricate the requested state", observed == oppositeTarget)
    }

    fun testVerificationConfirmsAlreadyCurrentState() {
        val wifi = context.getSystemService(WifiManager::class.java)
        val actual = wifi.isWifiEnabled
        assertEquals(actual, WifiScheduleManager.awaitWifiState(wifi, actual, timeoutMs = 0L))
    }
}
