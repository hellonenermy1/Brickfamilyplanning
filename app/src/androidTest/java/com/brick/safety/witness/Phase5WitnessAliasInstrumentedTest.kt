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

    fun testLegacyAdvertisementUsesOnlyNineByteBrickServicePayload() {
        val token = ByteArray(WitnessAliasKey.TOKEN_BYTES) { it.toByte() }
        val payload = WitnessMeshProvider.serviceDataPayload(token)
        assertEquals(1 + WitnessAliasKey.TOKEN_BYTES, payload.size)
        assertEquals(WitnessMeshProvider.AD_PAYLOAD_VERSION, payload[0])
        assertTrue(payload.copyOfRange(1, payload.size).contentEquals(token))

        // A 128-bit Service Data AD structure costs: length byte + type byte + 16-byte UUID +
        // Brick service payload. BLE flags normally cost another 3 bytes. Keeping only Service Data
        // therefore stays inside the 31-byte legacy advertisement budget: 1+1+16+9+3 = 30.
        val estimatedLegacyBytes = 1 + 1 + 16 + payload.size + 3
        assertTrue(estimatedLegacyBytes <= 31)
    }
}
