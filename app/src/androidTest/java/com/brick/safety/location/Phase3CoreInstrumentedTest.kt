package com.brick.safety.location

import com.brick.safety.testing.BrickInstrumentationTestCase
import kotlin.math.abs

@Suppress("DEPRECATION")
class Phase3CoreInstrumentedTest : BrickInstrumentationTestCase() {
    fun testLearnedOdometryAndZeroVelocityStayConservative() {
        val odo = LearnedOdometryModel()
        assertTrue(odo.calibrateStride(Phase3Mode.WALKING, MotionPlacement.HAND_LIKELY, 10, 8.0, 5f, 5f))
        assertTrue(odo.stride(Phase3Mode.WALKING, MotionPlacement.HAND_LIKELY).meanM in 0.72f..0.82f)
        val stationary = odo.propagate(OdometryInput(
            Phase3Mode.STATIONARY, MotionPlacement.UNKNOWN, 5.0, 0, 90f, 0f,
            0.96f, 0f, 2f, true, true, 10.0
        ))
        assertTrue(stationary.zeroVelocityApplied)
        assertEquals(0.0, stationary.distanceM)
        assertEquals(0.0, stationary.speedMps ?: -1.0)
    }

    fun testSequenceEvidenceNeedsRepeatedMultiSampleSupportAndExpires() {
        val nowWall = System.currentTimeMillis()
        val graph = LocalRouteGraph()
        val east = graph.addTrustedSegment(1.3000, 103.8000, 1.3000, 103.8010, Phase3Mode.WALKING, 5f, 5f, nowWall)!!
        graph.addTrustedSegment(1.3000, 103.8000, 1.3000, 103.8010, Phase3Mode.WALKING, 5f, 5f, nowWall + 1_000L)

        val magnetic = (0 until 8).map { i ->
            MagneticPoint(i * 600_000_000L, 20f + i * 1.8f, 5f - i * 0.7f, 34f + i * 0.4f, 40f + i * 1.1f, (i - 3) * 2.2f)
        }
        val magModel = MagneticSequenceModel()
        assertTrue(magModel.observeTrusted(east, 90f, magnetic, nowWall))
        assertTrue(magModel.match(90f, magnetic, nowWall).isEmpty())
        assertTrue(magModel.observeTrusted(east, 90f, magnetic.map { it.copy(eastUt = it.eastUt + 0.2f) }, nowWall + 1_000L))
        assertEquals(east, magModel.match(90f, magnetic, nowWall + 2_000L).firstOrNull()?.segmentId)
        assertTrue(magModel.match(90f, magnetic, nowWall + 91L * 24L * 60L * 60L * 1_000L).isEmpty())

        val events = listOf(
            LandmarkEvent(LandmarkKind.START, 0L, 1f),
            LandmarkEvent(LandmarkKind.TURN_RIGHT, 3_000_000_000L, 1f),
            LandmarkEvent(LandmarkKind.BUMP, 5_000_000_000L, 1f),
            LandmarkEvent(LandmarkKind.STOP, 8_000_000_000L, 1f)
        )
        val landmarkModel = LandmarkSequenceModel()
        assertTrue(landmarkModel.observeTrusted(east, events, nowWall))
        assertTrue(landmarkModel.match(events, nowWall).isEmpty())
        assertTrue(landmarkModel.observeTrusted(east, events, nowWall + 1_000L))
        assertEquals(east, landmarkModel.match(events, nowWall + 2_000L).firstOrNull()?.segmentId)
        assertTrue(landmarkModel.match(listOf(events[2]), nowWall + 2_000L).isEmpty())
        assertTrue(landmarkModel.match(events, nowWall + 91L * 24L * 60L * 60L * 1_000L).isEmpty())
    }

    fun testParticlesGrowUncertaintyEliminateRoutesPersistAndRecover() {
        val graph = LocalRouteGraph()
        val east = graph.addTrustedSegment(1.3000, 103.8000, 1.3000, 103.8010, Phase3Mode.WALKING, 5f, 5f, 1_000L)!!
        graph.addTrustedSegment(1.3000, 103.8000, 1.3000, 103.8010, Phase3Mode.WALKING, 5f, 5f, 2_000L)
        graph.addTrustedSegment(1.3000, 103.8000, 1.3010, 103.8000, Phase3Mode.WALKING, 5f, 5f, 1_000L)
        graph.addTrustedSegment(1.3000, 103.8000, 1.3010, 103.8000, Phase3Mode.WALKING, 5f, 5f, 2_000L)

        val pf = ParticlePositionEngine(96)
        pf.initialize(1.3000, 103.8000, 8f, 90f, null, 10_000L, 1_000_000L)
        val before = pf.estimate(10_000L)!!
        val after = pf.propagate(
            15_000L,
            OdometryDelta(28.0, 4.0, 90.0, 0.0, 8.0, 1.4, 7.0, false, true),
            Phase3Mode.WALKING,
            graph
        )!!
        assertTrue(after.uncertaintyM >= before.uncertaintyM)
        assertTrue(after.routeConstrained)
        assertEquals(east, after.routeCandidateIds.firstOrNull())

        val encoded = pf.encode()
        val restored = ParticlePositionEngine(96)
        assertTrue(restored.restore(encoded, 16_000L))
        assertTrue(abs(restored.estimate(16_000L)!!.lat - after.lat) < 0.0002)
        assertFalse(ParticlePositionEngine(96).restore(encoded, 1_000L))
        assertTrue(pf.estimate(10_000L + 21L * 60L * 1_000L)!!.expired)

        pf.initialize(1.3020, 103.8020, 6f, 180f, 0f, 2_000_000L, 3_000_000L)
        val recovered = pf.estimate(2_000_000L)!!
        assertTrue(recovered.uncertaintyM <= 6.01f)
        assertTrue(GeoMath.distanceMeters(1.3020, 103.8020, recovered.lat, recovered.lon) < 2.0)
    }

    fun testStationaryParticlesIgnoreRoutesAndStaleRoutesExpire() {
        val nowWall = 200L * 24L * 60L * 60L * 1_000L
        val graph = LocalRouteGraph()
        graph.mergePrivateMap(listOf(LocalRouteSegment(
            "map:test", 1.3000, 103.8000, 1.3000, 103.8010,
            Phase3Mode.WALKING.bit or Phase3Mode.VEHICLE.bit,
            1,
            nowWall,
            RouteSegmentSource.PRIVATE_MAP
        )))

        val pf = ParticlePositionEngine(96)
        pf.initialize(1.30015, 103.80050, 6f, 90f, 0f, 10_000L, nowWall)
        val before = pf.estimate(10_000L)!!
        val after = pf.propagate(
            15_000L,
            OdometryDelta(0.0, 0.5, 90.0, 0.0, 8.0, 0.0, 1.0, true, true),
            Phase3Mode.STATIONARY,
            graph
        )!!
        assertFalse(after.routeConstrained)
        assertTrue(after.routeCandidateIds.isEmpty())
        assertTrue(GeoMath.distanceMeters(before.lat, before.lon, after.lat, after.lon) < 1.0)

        val stalePrivate = LocalRouteGraph()
        stalePrivate.mergePrivateMap(listOf(LocalRouteSegment(
            "map:old", 1.3000, 103.8000, 1.3000, 103.8010,
            Phase3Mode.WALKING.bit,
            1,
            nowWall - 8L * 24L * 60L * 60L * 1_000L,
            RouteSegmentSource.PRIVATE_MAP
        )))
        stalePrivate.encode(nowWall)
        assertEquals(0, stalePrivate.size())

        val staleLearned = LocalRouteGraph()
        staleLearned.addTrustedSegment(1.3000, 103.8000, 1.3000, 103.8010, Phase3Mode.WALKING, 5f, 5f,
            nowWall - 181L * 24L * 60L * 60L * 1_000L)
        staleLearned.addTrustedSegment(1.3000, 103.8000, 1.3000, 103.8010, Phase3Mode.WALKING, 5f, 5f,
            nowWall - 181L * 24L * 60L * 60L * 1_000L + 1_000L)
        staleLearned.encode(nowWall)
        assertEquals(0, staleLearned.size())
    }
}
