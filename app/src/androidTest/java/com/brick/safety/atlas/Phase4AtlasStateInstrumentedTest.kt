package com.brick.safety.atlas

import android.test.InstrumentationTestCase
import java.io.File

@Suppress("DEPRECATION")
class Phase4AtlasStateInstrumentedTest : InstrumentationTestCase() {
    private fun file(): File = File(instrumentation.targetContext.filesDir, "brick_atlas_v1.bin")

    override fun setUp() {
        super.setUp()
        file().delete()
        File(instrumentation.targetContext.filesDir, "brick_atlas_v1.bin.bak").delete()
    }

    override fun tearDown() {
        file().delete()
        File(instrumentation.targetContext.filesDir, "brick_atlas_v1.bin.bak").delete()
        super.tearDown()
    }

    fun testPrivacyIdentifierIsStableNamespacedAndDoesNotExposeRawIdentifier() {
        val raw = "aa:bb:cc:dd:ee:ff"
        val wifi1 = AtlasPrivacyId.reduce("wifi", raw)
        val wifi2 = AtlasPrivacyId.reduce("wifi", raw)
        val ble = AtlasPrivacyId.reduce("ble", raw)
        assertEquals(wifi1, wifi2)
        assertFalse(wifi1 == ble)
        assertFalse(wifi1.contains(raw, ignoreCase = true))
        assertTrue(wifi1.matches(Regex("wifi:[0-9a-f]{24}")))
    }

    fun testAtlasStateRoundTripIsEncryptedAndRestoresModel() {
        val context = instrumentation.targetContext
        val now = System.currentTimeMillis()
        val atlas = EnvironmentalAtlas()
        val signal = AtlasSignalObservation(
            AtlasSignalKind.WIFI_AP,
            "wifi:111111111111111111111111",
            "wifi.scan",
            -52f,
            0.9f
        )
        repeat(3) { visit ->
            val wall = now - (3 - visit) * 16L * 60L * 1_000L
            val elapsed = 100_000L + visit * 1_100_000L
            assertTrue(atlas.observeTrusted(
                AtlasTrustedLabel("home-zone", 1.3000, 103.8000, 8f, elapsed, wall),
                AtlasScan(elapsed + 100L, wall + 100L, 0.9f, listOf(signal.copy(measurement = -52f + visit)))
            ))
        }

        val store = AtlasStateStore(context)
        assertTrue(store.write(atlas, now))
        val raw = file().readBytes()
        assertTrue(raw.size > 12)
        val rawText = raw.toString(Charsets.UTF_8)
        assertFalse(rawText.contains("home-zone"))
        assertFalse(rawText.contains("1.3000"))
        assertFalse(rawText.contains(signal.signalId))

        val restored = EnvironmentalAtlas()
        assertTrue(store.restoreInto(restored, now))
        assertEquals(atlas.labelCount(), restored.labelCount())
        assertEquals(atlas.signalCount(), restored.signalCount())
        val summary = restored.signalSummary(signal.kind, signal.signalId, now)
        assertNotNull(summary)
        assertEquals(AtlasSignalClass.DISTINCTIVE_STATIC, summary!!.classification)
    }

    fun testCorruptAtlasStateFailsClosedAndIsDeleted() {
        val context = instrumentation.targetContext
        file().writeBytes("not-encrypted-atlas-state".toByteArray())
        val prefs = context.getSharedPreferences("brick", 0)
        val before = prefs.getLong("atlasStateFailureTotal", 0L)
        val atlas = EnvironmentalAtlas()
        assertFalse(AtlasStateStore(context).restoreInto(atlas))
        assertFalse(file().exists())
        assertEquals(0, atlas.labelCount())
        assertFalse(prefs.getBoolean("atlasStateHealthy", true))
        assertTrue(prefs.getLong("atlasStateFailureTotal", 0L) >= before + 1L)
    }
}
