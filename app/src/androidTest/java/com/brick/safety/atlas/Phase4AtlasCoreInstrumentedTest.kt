package com.brick.safety.atlas

import com.brick.safety.testing.BrickInstrumentationTestCase

@Suppress("DEPRECATION")
class Phase4AtlasCoreInstrumentedTest : BrickInstrumentationTestCase() {
    private val baseWall = 1_800_000_000_000L

    private fun label(
        id: String = "home-zone",
        lat: Double = 1.3000,
        lon: Double = 103.8000,
        accuracy: Float = 8f,
        elapsed: Long = 100_000L,
        wall: Long = baseWall
    ) = AtlasTrustedLabel(id, lat, lon, accuracy, elapsed, wall)

    private fun obs(
        id: String,
        kind: AtlasSignalKind = AtlasSignalKind.WIFI_AP,
        group: String = "wifi.scan",
        value: Float? = -55f,
        quality: Float = 0.9f,
        common: Boolean = false
    ) = AtlasSignalObservation(kind, id, group, value, quality, semanticCommon = common)

    private fun scan(
        elapsed: Long = 100_500L,
        wall: Long = baseWall + 500L,
        quality: Float = 0.9f,
        observations: List<AtlasSignalObservation>
    ) = AtlasScan(elapsed, wall, quality, observations)

    fun testTrainingRequiresFreshAccurateTrustedLabel() {
        val atlas = EnvironmentalAtlas()
        val s = scan(observations = listOf(obs("wifi:111111111111111111111111")))
        assertFalse(atlas.observeTrusted(label(accuracy = 80f), s))
        assertFalse(atlas.observeTrusted(label(elapsed = 1_000L), s))
        assertEquals(0, atlas.labelCount())
        assertTrue(atlas.observeTrusted(label(), s))
        assertEquals(1, atlas.labelCount())
    }

    fun testDistinctiveSignalNeedsRepeatedTrustedVisits() {
        val atlas = EnvironmentalAtlas()
        val signal = obs("wifi:222222222222222222222222")
        assertTrue(atlas.observeTrusted(label(), scan(observations = listOf(signal))))
        var summary = atlas.signalSummary(signal.kind, signal.signalId, baseWall + 1_000L)!!
        assertEquals(AtlasSignalClass.UNKNOWN, summary.classification)

        val laterWall = baseWall + 16L * 60L * 1_000L
        val laterElapsed = 1_100_000L
        assertTrue(atlas.observeTrusted(
            label(elapsed = laterElapsed, wall = laterWall),
            scan(elapsed = laterElapsed + 500L, wall = laterWall + 500L, observations = listOf(signal.copy(measurement = -56f)))
        ))
        assertTrue(atlas.observeTrusted(
            label(elapsed = laterElapsed + 5_000L, wall = laterWall + 5_000L),
            scan(elapsed = laterElapsed + 5_500L, wall = laterWall + 5_500L, observations = listOf(signal.copy(measurement = -54f)))
        ))
        summary = atlas.signalSummary(signal.kind, signal.signalId, laterWall + 6_000L)!!
        assertEquals(AtlasSignalClass.DISTINCTIVE_STATIC, summary.classification)
        assertTrue(summary.internalTrustWeight > 0.10)
    }

    fun testCommonSemanticAndGeographicSpreadDestroyLocationWeight() {
        val atlas = EnvironmentalAtlas()
        val common = obs("ssid:333333333333333333333333", AtlasSignalKind.WIFI_SSID_HINT, common = true)
        val mobile = obs("ble:444444444444444444444444", AtlasSignalKind.BLE_DEVICE, group = "ble.scan")
        val points = listOf(
            Triple("pt1", 1.3000, 103.8000),
            Triple("pt2", 1.3150, 103.8150),
            Triple("pt3", 1.3300, 103.8300)
        )
        points.forEachIndexed { index, point ->
            val wall = baseWall + index * 20L * 60L * 1_000L
            val elapsed = 100_000L + index * 2_000_000L
            repeat(2) { n ->
                atlas.observeTrusted(
                    label(point.first, point.second, point.third, elapsed = elapsed + n * 1_000L, wall = wall + n * 1_000L),
                    scan(elapsed + n * 1_000L + 100L, wall + n * 1_000L + 100L, observations = listOf(common, mobile))
                )
            }
        }
        val commonSummary = atlas.signalSummary(common.kind, common.signalId, baseWall + 50L * 60L * 1_000L)!!
        assertEquals(AtlasSignalClass.GLOBAL_COMMON, commonSummary.classification)
        assertTrue(commonSummary.internalTrustWeight <= 0.02)

        val mobileSummary = atlas.signalSummary(mobile.kind, mobile.signalId, baseWall + 50L * 60L * 1_000L)!!
        assertEquals(AtlasSignalClass.MOBILE, mobileSummary.classification)
        assertTrue(mobileSummary.internalTrustWeight < 0.08)
    }

    fun testOneCorrelatedRadioFamilyCannotBecomePreciseLocationTruth() {
        val atlas = EnvironmentalAtlas()
        val wifi = (0 until 8).map { i -> obs("wifi:${(1000 + i).toString().padEnd(24, '0')}", value = (-45 - i).toFloat()) }
        repeat(3) { visit ->
            val wall = baseWall + visit * 16L * 60L * 1_000L
            val elapsed = 100_000L + visit * 1_100_000L
            atlas.observeTrusted(label(elapsed = elapsed, wall = wall), scan(elapsed + 100L, wall + 100L, observations = wifi))
        }
        val result = atlas.match(scan(elapsed = 4_000_000L, wall = baseWall + 49L * 60L * 1_000L, observations = wifi)).first()
        assertEquals(1, result.independenceGroups)
        assertTrue(result.supportWeight <= 0.45)
        assertTrue(result.uncertaintyM >= 35f)
    }

    fun testIndependentFamiliesCanSupportSameAreaWithoutBecomingProbability() {
        val atlas = EnvironmentalAtlas()
        val wifi = listOf(
            obs("wifi:aaaaaaaaaaaaaaaaaaaaaaaa", value = -48f),
            obs("wifi:bbbbbbbbbbbbbbbbbbbbbbbb", value = -58f)
        )
        val ble = listOf(
            obs("ble:cccccccccccccccccccccccc", AtlasSignalKind.BLE_DEVICE, "ble.scan", -62f),
            obs("ble:dddddddddddddddddddddddd", AtlasSignalKind.BLE_DEVICE, "ble.scan", -67f)
        )
        val network = obs("net:eeeeeeeeeeeeeeeeeeeeeeee", AtlasSignalKind.NETWORK_CONTEXT, "network.ctx", null, 0.8f)
        repeat(4) { visit ->
            val wall = baseWall + visit * 16L * 60L * 1_000L
            val elapsed = 100_000L + visit * 1_100_000L
            atlas.observeTrusted(label(elapsed = elapsed, wall = wall), scan(elapsed + 100L, wall + 100L, observations = wifi + ble + network))
        }
        val result = atlas.match(scan(
            elapsed = 5_000_000L,
            wall = baseWall + 65L * 60L * 1_000L,
            observations = wifi + ble + network
        )).first()
        assertTrue(result.independenceGroups >= 3)
        assertTrue(result.supportWeight > 0.45)
        assertTrue(result.supportWeight < 1.0)
    }

    fun testMissingProviderIsNotNegativeEvidenceAndModelsExpire() {
        val atlas = EnvironmentalAtlas()
        val wifi = listOf(
            obs("wifi:ffffffffffffffffffffffff", value = -50f),
            obs("wifi:999999999999999999999999", value = -60f)
        )
        repeat(4) { visit ->
            val wall = baseWall + visit * 16L * 60L * 1_000L
            val elapsed = 100_000L + visit * 1_100_000L
            atlas.observeTrusted(label(elapsed = elapsed, wall = wall), scan(elapsed + 100L, wall + 100L, observations = wifi))
        }
        val noWifi = scan(
            elapsed = 5_000_000L,
            wall = baseWall + 65L * 60L * 1_000L,
            observations = listOf(obs("net:121212121212121212121212", AtlasSignalKind.NETWORK_CONTEXT, "network.ctx", null))
        )
        assertTrue(atlas.match(noWifi).isEmpty())

        atlas.prune(baseWall + 181L * 24L * 60L * 60L * 1_000L)
        assertEquals(0, atlas.labelCount())
        assertEquals(0, atlas.signalCount())
    }
}
