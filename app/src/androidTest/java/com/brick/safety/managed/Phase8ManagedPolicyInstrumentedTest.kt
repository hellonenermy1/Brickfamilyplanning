package com.brick.safety.managed

import android.content.Context
import android.location.LocationManager
import com.brick.safety.privileged.NoPrivilegedBridge
import com.brick.safety.privileged.PrivilegedBleEvidence
import com.brick.safety.privileged.PrivilegedBridge
import com.brick.safety.privileged.PrivilegedBridgeHealth
import com.brick.safety.privileged.PrivilegedBridgeRuntime
import com.brick.safety.privileged.PrivilegedCellEvidence
import com.brick.safety.privileged.PrivilegedPowerDiagnostics
import com.brick.safety.privileged.PrivilegedWifiEvidence
import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase8ManagedPolicyInstrumentedTest : BrickInstrumentationTestCase() {
    private val context get() = instrumentation.targetContext

    private class CountingBridge : PrivilegedBridge {
        var locationCalls = 0
        override fun health(): PrivilegedBridgeHealth = NoPrivilegedBridge.health()
        override fun setParentLocationState(enabled: Boolean): Result<Boolean> {
            locationCalls += 1
            return Result.success(true)
        }
        override fun wifiEvidence(): Result<List<PrivilegedWifiEvidence>> = Result.failure(UnsupportedOperationException())
        override fun bleEvidence(): Result<List<PrivilegedBleEvidence>> = Result.failure(UnsupportedOperationException())
        override fun cellEvidence(): Result<List<PrivilegedCellEvidence>> = Result.failure(UnsupportedOperationException())
        override fun powerDiagnostics(): Result<PrivilegedPowerDiagnostics> = Result.failure(UnsupportedOperationException())
        override fun requestPowerRepair(): Result<Boolean> = Result.failure(UnsupportedOperationException())
        override fun attemptSosLocationEnable(): Result<Boolean> = Result.failure(UnsupportedOperationException())
    }

    override fun setUp() {
        super.setUp()
        context.getSharedPreferences("brick_managed_policy_p8", Context.MODE_PRIVATE).edit().clear().commit()
        context.getSharedPreferences("brick_parent_location", Context.MODE_PRIVATE).edit().clear().commit()
        context.getSharedPreferences("brick_beta_safety", Context.MODE_PRIVATE).edit().clear().commit()
        PrivilegedBridgeRuntime.clear()
    }

    override fun tearDown() {
        PrivilegedBridgeRuntime.clear()
        context.getSharedPreferences("brick_managed_policy_p8", Context.MODE_PRIVATE).edit().clear().commit()
        context.getSharedPreferences("brick_parent_location", Context.MODE_PRIVATE).edit().clear().commit()
        super.tearDown()
    }

    fun testAuthenticatedLocationCommandIsAttemptedAtMostOnce() {
        // First Phase 8 apply establishes migration state before a new command arrives.
        ManagedPolicy.apply(context)
        val bridge = CountingBridge()
        PrivilegedBridgeRuntime.install(bridge)

        val actualOn = context.getSystemService(LocationManager::class.java).isLocationEnabled
        val desired = if (actualOn) DesiredLocationState.OFF else DesiredLocationState.ON
        val now = System.currentTimeMillis()
        assertTrue(
            ParentLocationStateStore.applyVerified(
                context = context,
                desired = desired,
                commandId = "cmd-location-p8-0001",
                nonce = "11111111-1111-4111-8111-111111111111",
                issuedAtMs = now - 1_000L,
                expiresAtMs = now + 300_000L,
                nowMs = now
            )
        )

        ManagedPolicy.apply(context)
        assertEquals(1, bridge.locationCalls)
        val firstHistory = ManagedPolicy.lastLocationCommand(context)
        assertEquals("cmd-location-p8-0001", firstHistory.commandId)
        assertTrue(firstHistory.status == LocationCommandStatus.COMPLETED || firstHistory.status == LocationCommandStatus.FAILED)
        val prefs = context.getSharedPreferences("brick_managed_policy_p8", Context.MODE_PRIVATE)
        val firstAttempt = prefs.getLong("last_location_command_attempt_at", 0L)
        assertTrue(firstAttempt > 0L)

        // The 15-second supervisor may call ManagedPolicy.apply repeatedly; a terminal one-shot command
        // remains history and must never invoke Device Owner/Shizuku again.
        ManagedPolicy.apply(context)
        ManagedPolicy.apply(context)
        assertEquals(1, bridge.locationCalls)
        assertEquals(firstAttempt, prefs.getLong("last_location_command_attempt_at", 0L))
        assertEquals("cmd-location-p8-0001", ManagedPolicy.lastLocationCommand(context).commandId)

        val now2 = System.currentTimeMillis() + 2_000L
        assertTrue(
            ParentLocationStateStore.applyVerified(
                context = context,
                desired = desired,
                commandId = "cmd-location-p8-0002",
                nonce = "22222222-2222-4222-8222-222222222222",
                issuedAtMs = now2 - 500L,
                expiresAtMs = now2 + 300_000L,
                nowMs = now2
            )
        )
        ManagedPolicy.apply(context)
        assertEquals(2, bridge.locationCalls)
        val secondHistory = ManagedPolicy.lastLocationCommand(context)
        assertEquals("cmd-location-p8-0002", secondHistory.commandId)
        assertTrue(secondHistory.status == LocationCommandStatus.COMPLETED || secondHistory.status == LocationCommandStatus.FAILED)
    }

    fun testPhase7InheritedCommandIsMarkedConsumedWithoutReplayingOnUpgrade() {
        val bridge = CountingBridge()
        PrivilegedBridgeRuntime.install(bridge)
        val now = System.currentTimeMillis()

        // Reproduce the pre-one-shot Phase 7 on-disk shape: command metadata exists but there is no
        // terminal/pending status. The Phase 8 migration must classify it as historical completion,
        // not replay an old parent intent after upgrade.
        assertTrue(
            context.getSharedPreferences("brick_parent_location", Context.MODE_PRIVATE).edit()
                .putString("desired", DesiredLocationState.OFF.name)
                .putString("commandId", "cmd-location-p7-old01")
                .putString("nonce", "33333333-3333-4333-8333-333333333333")
                .putLong("issuedAtMs", now - 1_000L)
                .commit()
        )

        ManagedPolicy.apply(context)
        assertEquals(0, bridge.locationCalls)
        val history = ManagedPolicy.lastLocationCommand(context)
        assertEquals("cmd-location-p7-old01", history.commandId)
        assertEquals(LocationCommandStatus.COMPLETED, history.status)
        assertTrue(history.completedAtMs > 0L)
    }
}
