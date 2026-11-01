package com.brick.safety.managed

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class Phase6ParentLocationStateInstrumentedTest {
    private val context get() = ApplicationProvider.getApplicationContext<android.content.Context>()

    @Before
    fun reset() {
        context.getSharedPreferences("brick_parent_location", android.content.Context.MODE_PRIVATE)
            .edit().clear().commit()
    }

    @Test
    fun defaultsToOnForBackwardSafeUpgrade() {
        val state = ParentLocationStateStore.read(context)
        assertEquals(DesiredLocationState.ON, state.desired)
        assertNull(state.commandId)
        assertEquals(0L, state.issuedAtMs)
    }

    @Test
    fun verifiedCommandsPersistAndRejectReplayOrOlderState() {
        assertTrue(
            ParentLocationStateStore.applyVerified(
                context,
                DesiredLocationState.OFF,
                "cmd-location-0001",
                1_000L
            )
        )
        assertEquals(DesiredLocationState.OFF, ParentLocationStateStore.read(context).desired)

        assertFalse(
            ParentLocationStateStore.applyVerified(
                context,
                DesiredLocationState.ON,
                "cmd-location-0001",
                2_000L
            )
        )
        assertEquals(DesiredLocationState.OFF, ParentLocationStateStore.read(context).desired)

        assertFalse(
            ParentLocationStateStore.applyVerified(
                context,
                DesiredLocationState.ON,
                "cmd-location-0002",
                999L
            )
        )
        assertEquals(DesiredLocationState.OFF, ParentLocationStateStore.read(context).desired)

        assertTrue(
            ParentLocationStateStore.applyVerified(
                context,
                DesiredLocationState.ON,
                "cmd-location-0003",
                2_001L
            )
        )
        val finalState = ParentLocationStateStore.read(context)
        assertEquals(DesiredLocationState.ON, finalState.desired)
        assertEquals("cmd-location-0003", finalState.commandId)
        assertEquals(2_001L, finalState.issuedAtMs)
    }
}
