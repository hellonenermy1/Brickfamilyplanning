package com.brick.safety.network

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class Phase6LocationCommandInstrumentedTest {
    private val now = 100_000L
    private val deviceId = "11111111-1111-4111-8111-111111111111"
    private val nonce = "22222222-2222-4222-8222-222222222222"

    private fun commandJson(): JSONObject = JSONObject()
        .put("protocol", 1)
        .put("deviceId", deviceId)
        .put("commandId", "cmd-location-0001")
        .put("nonce", nonce)
        .put("desiredEnabled", false)
        .put("issuedAtMs", 50_000L)
        .put("expiresAtMs", now + 300_000L)

    @Test
    fun validDeviceBoundCommandIsParsed() {
        val parsed = BrickApi.parseHealthConfig(JSONObject().put("locationCommand", commandJson()), now).locationCommand
        requireNotNull(parsed)
        assertEquals(deviceId, parsed.deviceId)
        assertEquals("cmd-location-0001", parsed.commandId)
        assertEquals(nonce, parsed.nonce)
        assertFalse(parsed.desiredEnabled)
        assertEquals(50_000L, parsed.issuedAtMs)
        assertEquals(now + 300_000L, parsed.expiresAtMs)
    }

    @Test
    fun expiredMalformedOrOverlongDeliveryIsRejected() {
        val expired = commandJson().put("expiresAtMs", now)
        assertNull(BrickApi.parseHealthConfig(JSONObject().put("locationCommand", expired), now).locationCommand)

        val badDevice = commandJson().put("deviceId", "not-a-device")
        assertNull(BrickApi.parseHealthConfig(JSONObject().put("locationCommand", badDevice), now).locationCommand)

        val badNonce = commandJson().put("nonce", "replay-me")
        assertNull(BrickApi.parseHealthConfig(JSONObject().put("locationCommand", badNonce), now).locationCommand)

        val tooLong = commandJson().put("expiresAtMs", now + 10 * 60_000L + 1L)
        assertNull(BrickApi.parseHealthConfig(JSONObject().put("locationCommand", tooLong), now).locationCommand)

        val wrongProtocol = commandJson().put("protocol", 2)
        assertNull(BrickApi.parseHealthConfig(JSONObject().put("locationCommand", wrongProtocol), now).locationCommand)
    }

    @Test
    fun missingCommandLeavesExistingHealthFamiliesUsable() {
        val parsed = BrickApi.parseHealthConfig(JSONObject(), now)
        assertNull(parsed.locationCommand)
        assertNull(parsed.bleAnchors)
        assertNull(parsed.learnedPlaces)
        assertNull(parsed.coarseNetwork)
        assertTrue(true)
    }
}
