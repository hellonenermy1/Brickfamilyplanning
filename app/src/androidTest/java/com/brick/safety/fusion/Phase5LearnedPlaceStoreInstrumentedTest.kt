package com.brick.safety.fusion

import com.brick.safety.testing.BrickInstrumentationTestCase
import java.io.File

class Phase5LearnedPlaceStoreInstrumentedTest : BrickInstrumentationTestCase() {
    private val owner1 = "11111111-1111-4111-8111-111111111111"
    private val owner2 = "22222222-2222-4222-8222-222222222222"

    override fun setUp() {
        super.setUp()
        val context = instrumentation.targetContext
        context.getSharedPreferences("brick", 0).edit()
            .remove("deviceId")
            .remove("phase5LearnedPlacesHealthy")
            .remove("phase5LearnedPlaceCount")
            .commit()
        File(context.filesDir, LearnedPlaceRegistry.FILE_NAME).delete()
    }

    override fun tearDown() {
        val context = instrumentation.targetContext
        context.getSharedPreferences("brick", 0).edit()
            .remove("deviceId")
            .remove("phase5LearnedPlacesHealthy")
            .remove("phase5LearnedPlaceCount")
            .commit()
        File(context.filesDir, LearnedPlaceRegistry.FILE_NAME).delete()
        super.tearDown()
    }

    fun testCacheIsEncryptedRestorableAndBoundToCurrentPairing() {
        val context = instrumentation.targetContext
        val prefs = context.getSharedPreferences("brick", 0)
        prefs.edit().putString("deviceId", owner1).commit()
        val home = LearnedPlaceDefinition("home", "Home Secret Place", 1.3012345, 103.8123456, 120f)

        val registry = LearnedPlaceRegistry(context)
        assertTrue(registry.update(owner1, listOf(home)))
        assertEquals(1, registry.count())

        val file = File(context.filesDir, LearnedPlaceRegistry.FILE_NAME)
        assertTrue(file.exists())
        val raw = file.readBytes()
        assertTrue(raw.size > 13)
        val text = raw.toString(Charsets.ISO_8859_1)
        assertFalse(text.contains("Home Secret Place"))
        assertFalse(text.contains("1.3012345"))
        assertFalse(text.contains("103.8123456"))
        assertFalse(text.contains(owner1))

        // A fresh registry instance restores the encrypted cache for the same pairing.
        assertEquals(1, LearnedPlaceRegistry(context).count())

        // Caller-supplied ownership cannot write configuration for another device while this phone
        // is still paired to owner1.
        assertFalse(registry.update(owner2, listOf(
            LearnedPlaceDefinition("other", "Other", 1.31, 103.81, 100f)
        )))
        assertEquals(1, registry.count())

        // Re-pairing invalidates the old owner's local place configuration automatically. The old
        // encrypted file is rejected/deleted rather than donating Home/School information.
        prefs.edit().putString("deviceId", owner2).commit()
        assertEquals(0, registry.count())
        assertFalse(file.exists())
    }

    fun testUpdateRequiresCurrentPairedOwner() {
        val context = instrumentation.targetContext
        val registry = LearnedPlaceRegistry(context)
        val home = LearnedPlaceDefinition("home", "Home", 1.3, 103.8, 100f)
        assertFalse(registry.update(owner1, listOf(home)))

        context.getSharedPreferences("brick", 0).edit().putString("deviceId", owner1).commit()
        assertTrue(registry.update(owner1, listOf(home)))
        assertFalse(registry.update(owner2, listOf(home)))
    }
}
