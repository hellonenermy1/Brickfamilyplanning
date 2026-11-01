package com.brick.safety.privileged

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.After
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class Phase6PrivilegedBridgeInstrumentedTest {
    @After
    fun reset() = PrivilegedBridgeRuntime.clear()

    @Test
    fun normalBrickHasSafeUnavailableFallback() {
        PrivilegedBridgeRuntime.clear()
        val bridge = PrivilegedBridgeRuntime.current()
        val health = bridge.health()
        assertSame(NoPrivilegedBridge, bridge)
        assertFalse(health.available)
        assertFalse(health.connected)
        assertFalse(health.permissionGranted)
        assertTrue(health.capabilities.isEmpty())
        assertTrue(bridge.wifiEvidence().isFailure)
        assertTrue(bridge.bleEvidence().isFailure)
        assertTrue(bridge.cellEvidence().isFailure)
        assertTrue(bridge.powerDiagnostics().isFailure)
        assertTrue(bridge.requestPowerRepair().isFailure)
        assertTrue(bridge.attemptSosLocationEnable().isFailure)
    }

    @Test
    fun optionalProviderCanDisappearWithoutBreakingCoreRuntime() {
        val fake = object : PrivilegedBridge {
            override fun health() = PrivilegedBridgeHealth("test", true, true, true, setOf(PrivilegedCapability.WIFI_EVIDENCE))
            override fun wifiEvidence() = Result.success(emptyList<PrivilegedWifiEvidence>())
            override fun bleEvidence() = Result.failure<List<PrivilegedBleEvidence>>(UnsupportedOperationException())
            override fun cellEvidence() = Result.failure<List<PrivilegedCellEvidence>>(UnsupportedOperationException())
            override fun powerDiagnostics() = Result.failure<PrivilegedPowerDiagnostics>(UnsupportedOperationException())
            override fun requestPowerRepair() = Result.failure<Boolean>(UnsupportedOperationException())
            override fun attemptSosLocationEnable() = Result.failure<Boolean>(UnsupportedOperationException())
        }
        PrivilegedBridgeRuntime.install(fake)
        assertSame(fake, PrivilegedBridgeRuntime.current())
        PrivilegedBridgeRuntime.clear()
        assertSame(NoPrivilegedBridge, PrivilegedBridgeRuntime.current())
    }
}
