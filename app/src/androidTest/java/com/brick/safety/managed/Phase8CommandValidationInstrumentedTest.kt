package com.brick.safety.managed

import android.content.Context
import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase8CommandValidationInstrumentedTest : BrickInstrumentationTestCase() {
    private val context get() = instrumentation.targetContext.applicationContext

    override fun setUp() {
        super.setUp()
        context.getSharedPreferences("brick_parent_location", Context.MODE_PRIVATE).edit().clear().commit()
    }

    override fun tearDown() {
        context.getSharedPreferences("brick_parent_location", Context.MODE_PRIVATE).edit().clear().commit()
        super.tearDown()
    }

    fun testFutureExpiredAndImpossibleLifetimeCommandsAreRejectedAtDurableBoundary() {
        val now = 2_000_000_000_000L

        assertFailsWith<IllegalArgumentException> {
            ParentLocationStateStore.applyVerified(
                context,
                DesiredLocationState.OFF,
                "cmd-future-0001",
                "11111111-1111-4111-8111-111111111111",
                now + 60_001L,
                now + 120_000L,
                now
            )
        }

        assertFailsWith<IllegalArgumentException> {
            ParentLocationStateStore.applyVerified(
                context,
                DesiredLocationState.OFF,
                "cmd-expired-0001",
                "22222222-2222-4222-8222-222222222222",
                now - 60_000L,
                now - 1L,
                now
            )
        }

        assertFailsWith<IllegalArgumentException> {
            ParentLocationStateStore.applyVerified(
                context,
                DesiredLocationState.OFF,
                "cmd-lifetime-001",
                "33333333-3333-4333-8333-333333333333",
                now + 10_000L,
                now + 5_000L,
                now
            )
        }

        assertNull(ParentLocationStateStore.read(context).commandId)
    }

    fun testDuplicateNonceIdAndOlderTimestampCannotAdvanceState() {
        val now = 2_000_000_000_000L
        assertTrue(
            ParentLocationStateStore.applyVerified(
                context,
                DesiredLocationState.OFF,
                "cmd-valid-000001",
                "44444444-4444-4444-8444-444444444444",
                now - 1_000L,
                now + 300_000L,
                now
            )
        )

        assertFalse(
            ParentLocationStateStore.applyVerified(
                context,
                DesiredLocationState.ON,
                "cmd-valid-000001",
                "55555555-5555-4555-8555-555555555555",
                now,
                now + 300_000L,
                now
            )
        )
        assertFalse(
            ParentLocationStateStore.applyVerified(
                context,
                DesiredLocationState.ON,
                "cmd-valid-000002",
                "44444444-4444-4444-8444-444444444444",
                now,
                now + 300_000L,
                now
            )
        )
        assertFalse(
            ParentLocationStateStore.applyVerified(
                context,
                DesiredLocationState.ON,
                "cmd-valid-000003",
                "66666666-6666-4666-8666-666666666666",
                now - 2_000L,
                now + 300_000L,
                now
            )
        )

        val state = ParentLocationStateStore.read(context)
        assertEquals(DesiredLocationState.OFF, state.desired)
        assertEquals("cmd-valid-000001", state.commandId)
    }
}
