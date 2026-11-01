package com.brick.safety.atlas

import com.brick.safety.testing.BrickInstrumentationTestCase

@Suppress("DEPRECATION")
class Phase4SignalTrustInstrumentedTest : BrickInstrumentationTestCase() {
    private val baseWall = 1_790_000_000_000L

    private fun label(id: String, lat: Double, lon: Double, elapsed: Long, wall: Long) =
        AtlasTrustedLabel(id, lat, lon, 8f, elapsed, wall)

    private fun scan(elapsed: Long, wall: Long, observations: List<AtlasSignalObservation>) =
        AtlasScan(elapsed + 100L, wall + 100L, 0.9f, observations)

    private fun obs(
        id: String,
        kind: AtlasSignalKind = AtlasSignalKind.WIFI_AP,
        group: String = "wifi.scan",
        measurement: Float? = -55f,
        healthy: Boolean = true,
        trusted: Boolean = false
    ) = AtlasSignalObservation(
        kind,
        id,
        group,
        measurement,
        0.9f,
        trustedAnchor = trusted,
        sourceHealthy = healthy
    )

    fun testTrustedAnchorAndLocalCommonClassesStayDistinct() {
        val atlas = EnvironmentalAtlas()
        val anchor = obs("ble:111111111111111111111111", AtlasSignalKind.BLE_DEVICE, "ble.scan", -50f, trusted = true)
        repeat(2) { n ->
            atlas.observeTrusted(
                label("home-a", 1.3000, 103.8000, 100_000L + n * 1_000L, baseWall + n * 1_000L),
                scan(100_000L + n * 1_000L, baseWall + n * 1_000L, listOf(anchor))
            )
        }
        assertEquals(
            AtlasSignalClass.TRUSTED_ANCHOR,
            atlas.signalSummary(anchor.kind, anchor.signalId, baseWall + 5_000L)!!.classification
        )

        val common = obs("wifi:222222222222222222222222")
        val places = listOf(
            Triple("zone-a", 1.3000, 103.8000),
            Triple("zone-b", 1.3007, 103.8000)
        )
        places.forEachIndexed { index, place ->
            repeat(2) { n ->
                val wall = baseWall + (index * 20L + n) * 60_000L
                val elapsed = 1_000_000L + index * 2_000_000L + n * 1_000L
                atlas.observeTrusted(label(place.first, place.second, place.third, elapsed, wall), scan(elapsed, wall, listOf(common)))
            }
        }
        assertEquals(
            AtlasSignalClass.LOCAL_COMMON,
            atlas.signalSummary(common.kind, common.signalId, baseWall + 45L * 60_000L)!!.classification
        )
    }

    fun testUnhealthyRepeatedSignalBecomesUnstableAndOldSignalBecomesStale() {
        val atlas = EnvironmentalAtlas()
        val id = "ble:333333333333333333333333"
        repeat(6) { i ->
            val wall = baseWall + i * 4L * 60_000L
            val elapsed = 100_000L + i * 300_000L
            val unhealthy = i >= 2
            atlas.observeTrusted(
                label("site-one", 1.3000, 103.8000, elapsed, wall),
                scan(elapsed, wall, listOf(obs(id, AtlasSignalKind.BLE_DEVICE, "ble.scan", (-50 - i * 6).toFloat(), healthy = !unhealthy)))
            )
        }
        assertEquals(
            AtlasSignalClass.UNSTABLE,
            atlas.signalSummary(AtlasSignalKind.BLE_DEVICE, id, baseWall + 25L * 60_000L)!!.classification
        )

        val staleAt = baseWall + 91L * 24L * 60L * 60L * 1_000L
        assertEquals(
            AtlasSignalClass.STALE,
            atlas.signalSummary(AtlasSignalKind.BLE_DEVICE, id, staleAt)!!.classification
        )
    }

    fun testChargingOnlyRemainsWeakContextEvenAfterManyVisits() {
        val atlas = EnvironmentalAtlas()
        val charging = AtlasSignalObservation(
            AtlasSignalKind.CHARGING,
            "charge:wireless",
            "device.power",
            70f,
            0.25f
        )
        repeat(6) { visit ->
            val wall = baseWall + visit * 20L * 60L * 1_000L
            val elapsed = 100_000L + visit * 1_500_000L
            atlas.observeTrusted(label("home-power", 1.3000, 103.8000, elapsed, wall), scan(elapsed, wall, listOf(charging)))
        }
        val match = atlas.match(scan(10_000_000L, baseWall + 121L * 60L * 1_000L, listOf(charging))).firstOrNull()
        if (match != null) {
            assertTrue(match.supportWeight <= 0.25)
            assertEquals(1, match.independenceGroups)
            assertTrue(match.uncertaintyM >= 35f)
        }
    }

    fun testRouterReplacementDoesNotDestroyClusterWhenIndependentEvidenceRemains() {
        val atlas = EnvironmentalAtlas()
        val wifiA = obs("wifi:aaaaaaaaaaaaaaaaaaaaaaaa", measurement = -48f)
        val wifiB = obs("wifi:bbbbbbbbbbbbbbbbbbbbbbbb", measurement = -58f)
        val wifiC = obs("wifi:cccccccccccccccccccccccc", measurement = -52f)
        val ble = obs("ble:dddddddddddddddddddddddd", AtlasSignalKind.BLE_DEVICE, "ble.scan", -61f)

        repeat(4) { visit ->
            val wall = baseWall + visit * 20L * 60L * 1_000L
            val elapsed = 100_000L + visit * 1_500_000L
            atlas.observeTrusted(
                label("home-cluster", 1.3000, 103.8000, elapsed, wall),
                scan(elapsed, wall, listOf(wifiA, wifiB, ble))
            )
        }
        val before = atlas.match(scan(7_000_000L, baseWall + 81L * 60L * 1_000L, listOf(wifiB, ble))).first()
        assertEquals("home-cluster", before.labelId)
        assertTrue(before.independenceGroups >= 2)

        repeat(4) { visit ->
            val wall = baseWall + (5 + visit) * 20L * 60L * 1_000L
            val elapsed = 8_000_000L + visit * 1_500_000L
            atlas.observeTrusted(
                label("home-cluster", 1.3000, 103.8000, elapsed, wall),
                scan(elapsed, wall, listOf(wifiB, wifiC, ble))
            )
        }
        val after = atlas.match(scan(15_000_000L, baseWall + 181L * 60L * 1_000L, listOf(wifiB, wifiC, ble))).first()
        assertEquals("home-cluster", after.labelId)
        assertTrue(after.supportWeight > 0.30)
        assertTrue(after.negativePenalty <= 0.15)
    }
}
