package com.brick.safety.network

import com.brick.safety.testing.BrickInstrumentationTestCase

@Suppress("DEPRECATION")
class Phase3RouteGraphApiInstrumentedTest : BrickInstrumentationTestCase() {
    private fun response(segments: String, centerLat: Double = 1.3, centerLon: Double = 103.8, radiusM: Int = 650) =
        """{"protocol":1,"generatedAtMs":1700000000000,"center":{"lat":$centerLat,"lon":$centerLon},"radiusM":$radiusM,"segments":[$segments]}"""

    private fun segment(id: String, aLat: Double, aLon: Double, bLat: Double, bLon: Double, mask: Int = 60) =
        """{"id":"$id","aLat":$aLat,"aLon":$aLon,"bLat":$bLat,"bLon":$bLon,"allowedModeMask":$mask,"kind":"road","kindDetail":"residential"}"""

    fun testLocalSafeSegmentAccepted() {
        val json = response(segment("map:15/1/2:abc:0:0", 1.3000, 103.8000, 1.3000, 103.8010))
        val parsed = RouteGraphApi.parse(json, 1.3, 103.8)
        assertEquals(1, parsed.segments.size)
        assertEquals("map:15/1/2:abc:0:0", parsed.segments.single().id)
    }

    fun testUnsafeIdentifierCannotEnterSerializedRouteState() {
        val bad = response(segment("map:bad|inject;state", 1.3000, 103.8000, 1.3000, 103.8010))
        assertTrue(RouteGraphApi.parse(bad, 1.3, 103.8).segments.isEmpty())
    }

    fun testOutOfAreaSegmentIsDiscarded() {
        val far = response(segment("map:far", 1.4000, 103.9000, 1.4001, 103.9001))
        assertTrue(RouteGraphApi.parse(far, 1.3, 103.8).segments.isEmpty())
    }

    fun testCenterAndRadiusRemainStrict() {
        val local = segment("map:local", 1.3000, 103.8000, 1.3000, 103.8010)
        assertTrue(runCatching { RouteGraphApi.parse(response(local, centerLat = 1.31), 1.3, 103.8) }.isFailure)
        assertTrue(runCatching { RouteGraphApi.parse(response(local, radiusM = 651), 1.3, 103.8) }.isFailure)
    }

    fun testUnknownModeBitsAreDiscarded() {
        val badMask = response(segment("map:badmask", 1.3000, 103.8000, 1.3000, 103.8010, mask = 1 shl 12))
        assertTrue(RouteGraphApi.parse(badMask, 1.3, 103.8).segments.isEmpty())
    }
}
