package com.brick.safety.witness

import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase5WitnessAliasInstrumentedTest : BrickInstrumentationTestCase() {
    private val deviceId = "123e4567-e89b-42d3-a456-426614174000"

    fun testAliasIsStableInsideSlotAndRotatesAcrossSlots() {
        val slot = 6_000_000L
        val a = WitnessAliasKey.token(deviceId, slot)
        val b = WitnessAliasKey.token(deviceId, slot)
        val c = WitnessAliasKey.token(deviceId, slot + 1L)
        assertEquals(WitnessAliasKey.TOKEN_BYTES, a.size)
        assertTrue(a.contentEquals(b))
        assertFalse(a.contentEquals(c))
        assertEquals(WitnessAliasKey.TOKEN_BYTES * 2, WitnessAliasKey.tokenHex(deviceId, slot).length)
    }

    fun testWallTimeUsesFiveMinuteSlots() {
        val t = WitnessAliasKey.SLOT_MS * 100L + 1234L
        assertEquals(100L, WitnessAliasKey.slotForWallTime(t))
        assertEquals(101L, WitnessAliasKey.slotForWallTime(t + WitnessAliasKey.SLOT_MS))
    }

    fun testDeviceIdentityIsBoundIntoAlias() {
        val other = "123e4567-e89b-42d3-b456-426614174001"
        val slot = 6_000_001L
        assertFalse(WitnessAliasKey.token(deviceId, slot).contentEquals(WitnessAliasKey.token(other, slot)))
    }
}
