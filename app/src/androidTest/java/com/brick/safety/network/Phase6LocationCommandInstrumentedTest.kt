package com.brick.safety.network

import com.brick.safety.testing.BrickInstrumentationTestCase
import org.json.JSONObject

class Phase6LocationCommandInstrumentedTest : BrickInstrumentationTestCase() {
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

    fun testValidDeviceBoundCommandIsParsed() {
        val parsed = BrickApi.parseHealthConfig(JSONObject().put("locationCommand", commandJson()), now).locationCommand
        requireNotNull(parsed)
        assertEquals(deviceId, parsed.deviceId)
        assertEquals("cmd-location-0001", parsed.commandId)
        assertEquals(nonce, parsed.nonce)
        assertFalse(parsed.desiredEnabled)
        assertEquals(50_000L, parsed.issuedAtMs)
        assertEquals(now + 300_000L, parsed.expiresAtMs)
    }

    fun testMalformedExpiredOrAmbiguousDeliveryIsRejected() {
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

        val textBoolean = commandJson().put("desiredEnabled", "false")
        assertNull(BrickApi.parseHealthConfig(JSONObject().put("locationCommand", textBoolean), now).locationCommand)

        val backwardsWindow = commandJson().put("issuedAtMs", now + 400_000L).put("expiresAtMs", now + 300_000L)
        assertNull(BrickApi.parseHealthConfig(JSONObject().put("locationCommand", backwardsWindow), now).locationCommand)

        val futureIssued = commandJson().put("issuedAtMs", now + 60_001L).put("expiresAtMs", now + 300_000L)
        assertNull(BrickApi.parseHealthConfig(JSONObject().put("locationCommand", futureIssued), now).locationCommand)
    }

    fun testMissingCommandLeavesExistingHealthFamiliesUsable() {
        val parsed = BrickApi.parseHealthConfig(JSONObject(), now)
        assertNull(parsed.locationCommand)
        assertNull(parsed.bleAnchors)
        assertNull(parsed.learnedPlaces)
        assertNull(parsed.coarseNetwork)
        assertTrue(true)
    }
}
