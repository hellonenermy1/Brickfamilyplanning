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

    fun testCopiedSsidAcrossDistantPlacesCannotBecomeAnAnchor() {
        val atlas = EnvironmentalAtlas()
        val copied = obs(
            "ssid:copiednetwork000000000000",
            AtlasSignalKind.WIFI_SSID_HINT,
            "wifi.scan",
            null
        )
        val places = listOf(
            Triple("copied-a", 1.3000, 103.8000),
            Triple("copied-b", 1.3500, 103.8500),
            Triple("copied-c", 1.4000, 103.9000)
        )
        places.forEachIndexed { index, place ->
            repeat(2) { visit ->
                val wall = baseWall + (index * 50L + visit * 20L) * 60_000L
                val elapsed = 1_000_000L + index * 4_000_000L + visit * 1_500_000L
                assertTrue(atlas.observeTrusted(
                    label(place.first, place.second, place.third, elapsed, wall),
                    scan(elapsed, wall, listOf(copied))
                ))
            }
        }
        val summary = atlas.signalSummary(
            copied.kind,
            copied.signalId,
            baseWall + 150L * 60_000L
        )!!
        assertEquals(AtlasSignalClass.GLOBAL_COMMON, summary.classification)
        assertTrue(summary.internalTrustWeight <= 0.02)
        assertTrue(atlas.match(scan(20_000_000L, baseWall + 151L * 60_000L, listOf(copied))).isEmpty())
    }

    fun testRepeatedTrustedDisappearanceRetiresReplacedBeaconAndLanDevice() {
        val atlas = EnvironmentalAtlas()
        val wifi = obs("wifi:stablehome00000000000000", measurement = -50f)
        val oldBle = obs("ble:oldbeacon000000000000000", AtlasSignalKind.BLE_DEVICE, "ble.scan", -58f)
        val newBle = obs("ble:newbeacon000000000000000", AtlasSignalKind.BLE_DEVICE, "ble.scan", -57f)
        val oldLan = obs("lan:olddevice000000000000000", AtlasSignalKind.LAN_SERVICE, "lan.nsd.cast", null)
        val newLan = obs("lan:newdevice000000000000000", AtlasSignalKind.LAN_SERVICE, "lan.nsd.cast", null)

        repeat(4) { visit ->
            val wall = baseWall + visit * 20L * 60_000L
            val elapsed = 100_000L + visit * 1_500_000L
            assertTrue(atlas.observeTrusted(
                label("replacement-home", 1.3000, 103.8000, elapsed, wall),
                scan(elapsed, wall, listOf(wifi, oldBle, oldLan))
            ))
        }

        run {
            val wall = baseWall + 90L * 60_000L
            val elapsed = 8_000_000L
            assertTrue(atlas.observeTrusted(
                label("replacement-home", 1.3000, 103.8000, elapsed, wall),
                scan(elapsed, wall, listOf(wifi, newBle, newLan))
            ))
            assertNotNull(atlas.signalSummary(oldBle.kind, oldBle.signalId, wall + 1_000L))
            assertNotNull(atlas.signalSummary(oldLan.kind, oldLan.signalId, wall + 1_000L))
        }

        repeat(11) { n ->
            val wall = baseWall + (91L + n) * 60_000L
            val elapsed = 8_100_000L + n * 70_000L
            assertTrue(atlas.observeTrusted(
                label("replacement-home", 1.3000, 103.8000, elapsed, wall),
                scan(elapsed, wall, listOf(wifi, newBle, newLan))
            ))
        }
        assertNull(atlas.signalSummary(oldBle.kind, oldBle.signalId, baseWall + 103L * 60_000L))
        assertNull(atlas.signalSummary(oldLan.kind, oldLan.signalId, baseWall + 103L * 60_000L))

        val finalWall = baseWall + 125L * 60_000L
        val finalElapsed = 10_000_000L
        assertTrue(atlas.observeTrusted(
            label("replacement-home", 1.3000, 103.8000, finalElapsed, finalWall),
            scan(finalElapsed, finalWall, listOf(wifi, newBle, newLan))
        ))
        assertNotNull(atlas.signalSummary(newBle.kind, newBle.signalId, finalWall + 1_000L))
        assertNotNull(atlas.signalSummary(newLan.kind, newLan.signalId, finalWall + 1_000L))
    }

    fun testLanAbsenceOnlyCountsInsideSameDiscoveryCategory() {
        val atlas = EnvironmentalAtlas()
        val cast = obs("lan:castdevice000000000000000", AtlasSignalKind.LAN_SERVICE, "lan.nsd.cast", null)
        val printerMarker = AtlasSignalObservation(
            AtlasSignalKind.LAN_SERVICE,
            "lanempty:printer000000000000",
            "lan.nsd.printer",
            null,
            0.60f,
            semanticCommon = true
        )
        val castMarker = AtlasSignalObservation(
            AtlasSignalKind.LAN_SERVICE,
            "lanempty:cast00000000000000000",
            "lan.nsd.cast",
            null,
            0.60f,
            semanticCommon = true
        )

        repeat(4) { visit ->
            val wall = baseWall + visit * 20L * 60_000L
            val elapsed = 100_000L + visit * 1_500_000L
            assertTrue(atlas.observeTrusted(
                label("lan-scope-home", 1.3000, 103.8000, elapsed, wall),
                scan(elapsed, wall, listOf(cast))
            ))
        }

        repeat(14) { n ->
            val wall = baseWall + (90L + n) * 60_000L
            val elapsed = 8_000_000L + n * 70_000L
            assertTrue(atlas.observeTrusted(
                label("lan-scope-home", 1.3000, 103.8000, elapsed, wall),
                scan(elapsed, wall, listOf(printerMarker))
            ))
        }
        assertNotNull(atlas.signalSummary(cast.kind, cast.signalId, baseWall + 105L * 60_000L))

        repeat(12) { n ->
            val wall = baseWall + (120L + n) * 60_000L
            val elapsed = 10_000_000L + n * 70_000L
            assertTrue(atlas.observeTrusted(
                label("lan-scope-home", 1.3000, 103.8000, elapsed, wall),
                scan(elapsed, wall, listOf(castMarker))
            ))
        }
        assertNull(atlas.signalSummary(cast.kind, cast.signalId, baseWall + 133L * 60_000L))
    }

    fun testChangingCellularEnvironmentCannotRelocatePhoneAgainstIndependentEvidence() {
        val atlas = EnvironmentalAtlas()
        val homeWifi = obs("wifi:homewifi0000000000000000", measurement = -50f)
        val homeBle = obs("ble:homeble00000000000000000", AtlasSignalKind.BLE_DEVICE, "ble.scan", -60f)
        val oldCell = obs("cell:homecell000000000000000", AtlasSignalKind.CELLULAR, "cell.env", -92f)
        val newCell = obs("cell:newcell0000000000000000", AtlasSignalKind.CELLULAR, "cell.env", -88f)
        val schoolWifi = obs("wifi:schoolwifi00000000000000", measurement = -52f)
        val schoolBle = obs("ble:schoolble000000000000000", AtlasSignalKind.BLE_DEVICE, "ble.scan", -62f)
        val schoolCell = obs("cell:schoolcell0000000000000", AtlasSignalKind.CELLULAR, "cell.env", -90f)

        repeat(4) { visit ->
            val wall = baseWall + visit * 20L * 60_000L
            val elapsed = 100_000L + visit * 1_500_000L
            atlas.observeTrusted(
                label("cell-home", 1.3000, 103.8000, elapsed, wall),
                scan(elapsed, wall, listOf(homeWifi, homeBle, oldCell))
            )
        }
        repeat(4) { visit ->
            val wall = baseWall + (100L + visit * 20L) * 60_000L
            val elapsed = 10_000_000L + visit * 1_500_000L
            atlas.observeTrusted(
                label("cell-school", 1.3600, 103.8600, elapsed, wall),
                scan(elapsed, wall, listOf(schoolWifi, schoolBle, schoolCell))
            )
        }

        val result = atlas.match(
            scan(20_000_000L, baseWall + 181L * 60_000L, listOf(homeWifi, homeBle, newCell))
        ).first()
        assertEquals("cell-home", result.labelId)
        assertTrue(result.independenceGroups >= 2)
        assertTrue(result.negativePenalty <= 0.15)
    }
}
