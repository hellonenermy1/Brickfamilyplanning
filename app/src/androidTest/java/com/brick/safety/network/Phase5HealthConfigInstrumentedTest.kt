package com.brick.safety.network

import com.brick.safety.testing.BrickInstrumentationTestCase
import org.json.JSONArray
import org.json.JSONObject

class Phase5HealthConfigInstrumentedTest : BrickInstrumentationTestCase() {
    fun testMissingLearnedPlacesMeansPreserveExistingEncryptedCache() {
        val config = BrickApi.parseHealthConfig(JSONObject().put("bleAnchors", JSONArray()))
        assertNotNull(config.bleAnchors)
        assertTrue(config.bleAnchors!!.isEmpty())
        assertNull(config.learnedPlaces)
        assertNull(config.coarseNetwork)
    }

    fun testExplicitEmptyLearnedPlacesMeansIntentionalClear() {
        val config = BrickApi.parseHealthConfig(JSONObject().put("learnedPlaces", JSONArray()))
        assertNotNull(config.learnedPlaces)
        assertTrue(config.learnedPlaces!!.isEmpty())
        assertNull(config.bleAnchors)
        assertNull(config.coarseNetwork)
    }

    fun testLearnedPlacesAreBoundedValidatedAndDeduplicated() {
        val places = JSONArray()
            .put(JSONObject().put("id", "home").put("name", "Home").put("latitude", 1.3000).put("longitude", 103.8000).put("radiusM", 120))
            .put(JSONObject().put("id", "home").put("name", "Duplicate").put("latitude", 1.3001).put("longitude", 103.8001).put("radiusM", 120))
            .put(JSONObject().put("id", "bad id with spaces").put("name", "Bad").put("latitude", 1.30).put("longitude", 103.80).put("radiusM", 100))
            .put(JSONObject().put("id", "bad-lat").put("name", "Bad").put("latitude", 91).put("longitude", 103.80).put("radiusM", 100))
            .put(JSONObject().put("id", "school").put("name", "School").put("latitude", 1.3300).put("longitude", 103.8200).put("radiusM", 150))
        val config = BrickApi.parseHealthConfig(JSONObject().put("learnedPlaces", places))
        assertEquals(2, config.learnedPlaces!!.size)
        assertEquals(listOf("home", "school"), config.learnedPlaces!!.map { it.id })
    }

    fun testMalformedConfigurationFamilyFailsClosedToEmptyNotCrash() {
        val config = BrickApi.parseHealthConfig(
            JSONObject()
                .put("learnedPlaces", JSONObject().put("unexpected", true))
                .put("bleAnchors", JSONObject().put("unexpected", true))
        )
        assertNotNull(config.learnedPlaces)
        assertTrue(config.learnedPlaces!!.isEmpty())
        assertNotNull(config.bleAnchors)
        assertTrue(config.bleAnchors!!.isEmpty())
        assertNull(config.coarseNetwork)
    }

    fun testCoarseNetworkAcceptsOnlyValidCoordinatesAndDoesNotTrustServerRadius() {
        val config = BrickApi.parseHealthConfig(
            JSONObject().put(
                "coarseNetwork",
                JSONObject()
                    .put("latitude", 1.3521)
                    .put("longitude", 103.8198)
                    .put("radiusM", 1)
            )
        )
        assertNotNull(config.coarseNetwork)
        assertEquals(1.3521, config.coarseNetwork!!.latitude)
        assertEquals(103.8198, config.coarseNetwork!!.longitude)
    }

    fun testMalformedCoarseNetworkIsDiscarded() {
        assertNull(
            BrickApi.parseHealthConfig(
                JSONObject().put("coarseNetwork", JSONObject().put("latitude", 91).put("longitude", 103.8))
            ).coarseNetwork
        )
        assertNull(
            BrickApi.parseHealthConfig(
                JSONObject().put("coarseNetwork", JSONObject().put("latitude", 1.3).put("longitude", 181))
            ).coarseNetwork
        )
    }
}
