package com.brick.safety.fusion

import com.brick.safety.atlas.AtlasGrid
import com.brick.safety.atlas.AtlasRuntimeSnapshot
import com.brick.safety.atlas.AtlasScan
import com.brick.safety.atlas.AtlasSignalKind
import com.brick.safety.atlas.AtlasSignalObservation
import com.brick.safety.atlas.AtlasTrustedLabel
import com.brick.safety.atlas.EnvironmentalAtlas
import com.brick.safety.location.PositionQuality
import com.brick.safety.testing.BrickInstrumentationTestCase

/**
 * Wi-Fi RTT has a real distance but Brick does not know an authenticated physical AP coordinate.
 * The safe V1 use is therefore measurement likelihood against trusted Atlas labels. It may rerank
 * existing hypotheses, but RTT alone never invents a direction/coordinate or upgrades to PRECISE.
 */
class Phase5RttAtlasInstrumentedTest : BrickInstrumentationTestCase() {
    private val wall0 = 1_800_000_000_000L
    private val nearLat = 1.3000
    private val nearLon = 103.8000
    private val farLat = 1.3010
    private val farLon = 103.8000
    private val rttId = "rtt:aaaaaaaaaaaaaaaaaaaaaaaa"
    private val networkId = "net:bbbbbbbbbbbbbbbbbbbbbbbb"

    private fun observations(rangeM: Float) = listOf(
        AtlasSignalObservation(
            kind = AtlasSignalKind.WIFI_AP,
            signalId = rttId,
            independenceGroup = "wifi.scan",
            measurement = rangeM,
            quality = 0.95f
        ),
        AtlasSignalObservation(
            kind = AtlasSignalKind.NETWORK_CONTEXT,
            signalId = networkId,
            independenceGroup = "network.ctx",
            measurement = null,
            quality = 0.80f
        )
    )

    fun testRttDistanceReranksTrustedAtlasAreaWithoutManufacturingPrecision() {
        val atlas = EnvironmentalAtlas()
        repeat(4) { visit ->
            val nearWall = wall0 + visit * 40L * 60L * 1_000L
            val nearElapsed = 100_000L + visit * 3_000_000L
            val nearLabel = AtlasTrustedLabel(
                AtlasGrid.labelFor(nearLat, nearLon), nearLat, nearLon, 8f,
                nearElapsed, nearWall, AtlasGrid.zoneFor(nearLat, nearLon)
            )
            assertTrue(atlas.observeTrusted(
                nearLabel,
                AtlasScan(nearElapsed + 100, nearWall + 100, 0.95f, observations(5f + (visit % 2)))
            ))

            val farWall = nearWall + 20L * 60L * 1_000L
            val farElapsed = nearElapsed + 1_500_000L
            val farLabel = AtlasTrustedLabel(
                AtlasGrid.labelFor(farLat, farLon), farLat, farLon, 8f,
                farElapsed, farWall, AtlasGrid.zoneFor(farLat, farLon)
            )
            assertTrue(atlas.observeTrusted(
                farLabel,
                AtlasScan(farElapsed + 100, farWall + 100, 0.95f, observations(45f + (visit % 2)))
            ))
        }

        val nowElapsed = 20_000_000L
        val nowWall = wall0 + 4L * 40L * 60L * 1_000L + 1_000L
        val current = AtlasScan(nowElapsed, nowWall, 0.95f, observations(6f))
        val candidates = atlas.match(current)
        assertTrue(candidates.isNotEmpty())
        assertEquals(AtlasGrid.labelFor(nearLat, nearLon), candidates.first().labelId)

        val snapshot = AtlasRuntimeSnapshot(candidates, nowElapsed, emptyMap())
        val constraint = Phase5FusionAdapter.fromAtlas(snapshot, nowElapsed + 500L)
        assertNotNull(constraint)
        assertEquals(FusionEvidenceKind.ATLAS, constraint!!.kind)
        assertEquals(PositionQuality.ESTIMATED, constraint.upperState)

        val result = ParallelEvidenceEngine().fuse(nowElapsed + 500L, listOf(constraint))
        assertTrue(result.hasPosition)
        assertEquals(PositionQuality.ESTIMATED, result.state)
        assertTrue(result.state != PositionQuality.PRECISE && result.state != PositionQuality.ASSISTED)
    }
}
