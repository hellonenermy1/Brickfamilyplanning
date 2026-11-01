package com.brick.safety.managed

import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase6ParentLocationStateInstrumentedTest : BrickInstrumentationTestCase() {
    private val context get() = instrumentation.targetContext

    override fun setUp() {
        super.setUp()
        context.getSharedPreferences("brick_parent_location", android.content.Context.MODE_PRIVATE)
            .edit().clear().commit()
    }

    fun testDefaultsToOnForBackwardSafeUpgrade() {
        val state = ParentLocationStateStore.read(context)
        assertEquals(DesiredLocationState.ON, state.desired)
        assertNull(state.commandId)
        assertNull(state.nonce)
        assertEquals(0L, state.issuedAtMs)
    }

    fun testVerifiedCommandsPersistAndRejectDuplicateReplayOlderAndExpiredState() {
        val now = 10_000L
        val nonce1 = "11111111-1111-4111-8111-111111111111"
        val nonce2 = "22222222-2222-4222-8222-222222222222"
        val nonce3 = "33333333-3333-4333-8333-333333333333"
        val nonce4 = "44444444-4444-4444-8444-444444444444"

        assertTrue(
            ParentLocationStateStore.applyVerified(
                context, DesiredLocationState.OFF, "cmd-location-0001", nonce1,
                issuedAtMs = 1_000L, expiresAtMs = now + 300_000L, nowMs = now
            )
        )
        assertEquals(DesiredLocationState.OFF, ParentLocationStateStore.read(context).desired)

        assertFalse(
            ParentLocationStateStore.applyVerified(
                context, DesiredLocationState.ON, "cmd-location-0001", nonce2,
                issuedAtMs = 2_000L, expiresAtMs = now + 300_000L, nowMs = now
            )
        )
        assertFalse(
            ParentLocationStateStore.applyVerified(
                context, DesiredLocationState.ON, "cmd-location-0002", nonce1,
                issuedAtMs = 2_000L, expiresAtMs = now + 300_000L, nowMs = now
            )
        )
        assertFalse(
            ParentLocationStateStore.applyVerified(
                context, DesiredLocationState.ON, "cmd-location-0002", nonce2,
                issuedAtMs = 999L, expiresAtMs = now + 300_000L, nowMs = now
            )
        )
        assertTrue(
            runCatching {
                ParentLocationStateStore.applyVerified(
                    context, DesiredLocationState.ON, "cmd-location-0003", nonce3,
                    issuedAtMs = 2_001L, expiresAtMs = now - 1L, nowMs = now
                )
            }.isFailure
        )
        assertEquals(DesiredLocationState.OFF, ParentLocationStateStore.read(context).desired)

        assertTrue(
            ParentLocationStateStore.applyVerified(
                context, DesiredLocationState.ON, "cmd-location-0004", nonce4,
                issuedAtMs = 2_002L, expiresAtMs = now + 300_000L, nowMs = now
            )
        )
        val finalState = ParentLocationStateStore.read(context)
        assertEquals(DesiredLocationState.ON, finalState.desired)
        assertEquals("cmd-location-0004", finalState.commandId)
        assertEquals(nonce4, finalState.nonce)
        assertEquals(2_002L, finalState.issuedAtMs)
    }
}
