package com.brick.safety.privileged

import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase6PrivilegedBridgeInstrumentedTest : BrickInstrumentationTestCase() {
    override fun tearDown() {
        PrivilegedBridgeRuntime.clear()
        super.tearDown()
    }

    fun testNormalBrickHasSafeUnavailableFallback() {
        PrivilegedBridgeRuntime.clear()
        val bridge = PrivilegedBridgeRuntime.current()
        val health = bridge.health()
        assertSame(NoPrivilegedBridge, bridge)
        assertFalse(health.available)
        assertFalse(health.connected)
        assertFalse(health.permissionGranted)
        assertTrue(health.capabilities.isEmpty())
        assertTrue(bridge.setParentLocationState(true).isFailure)
        assertTrue(bridge.wifiEvidence().isFailure)
        assertTrue(bridge.bleEvidence().isFailure)
        assertTrue(bridge.cellEvidence().isFailure)
        assertTrue(bridge.powerDiagnostics().isFailure)
        assertTrue(bridge.requestPowerRepair().isFailure)
        assertTrue(bridge.attemptSosLocationEnable().isFailure)
    }

    fun testTypedProviderCanControlLocationWithoutGenericShellSurface() {
        var requested: Boolean? = null
        val fake = object : PrivilegedBridge {
            override fun health() = PrivilegedBridgeHealth(
                "test", true, true, true,
                setOf(PrivilegedCapability.LOCATION_CONTROL, PrivilegedCapability.WIFI_EVIDENCE)
            )
            override fun setParentLocationState(enabled: Boolean): Result<Boolean> {
                requested = enabled
                return Result.success(true)
            }
            override fun wifiEvidence() = Result.success(emptyList<PrivilegedWifiEvidence>())
            override fun bleEvidence() = Result.failure<List<PrivilegedBleEvidence>>(UnsupportedOperationException())
            override fun cellEvidence() = Result.failure<List<PrivilegedCellEvidence>>(UnsupportedOperationException())
            override fun powerDiagnostics() = Result.failure<PrivilegedPowerDiagnostics>(UnsupportedOperationException())
            override fun requestPowerRepair() = Result.failure<Boolean>(UnsupportedOperationException())
            override fun attemptSosLocationEnable() = Result.failure<Boolean>(UnsupportedOperationException())
        }
        PrivilegedBridgeRuntime.install(fake)
        assertTrue(PrivilegedBridgeRuntime.current().setParentLocationState(false).getOrThrow())
        assertFalse(requested ?: true)
        assertTrue(fake.health().capabilities.contains(PrivilegedCapability.LOCATION_CONTROL))
    }

    fun testOptionalProviderCanDisappearWithoutBreakingCoreRuntime() {
        val fake = object : PrivilegedBridge {
            override fun health() = PrivilegedBridgeHealth("test", true, true, true, setOf(PrivilegedCapability.WIFI_EVIDENCE))
            override fun setParentLocationState(enabled: Boolean) = Result.failure<Boolean>(UnsupportedOperationException())
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
