package com.brick.safety.atlas

import com.brick.safety.testing.BrickInstrumentationTestCase

class Phase4CompanionContextInstrumentedTest : BrickInstrumentationTestCase() {
    private val baseWall = 1_800_000_000_000L

    override fun setUp() {
        super.setUp()
        val context = instrumentation.targetContext
        context.getSharedPreferences("brick_companion_presence", 0).edit().clear().commit()
    }

    fun testAssociationPresenceIsPrunedWhenAssociationNoLongerValid() {
        val context = instrumentation.targetContext
        CompanionPresenceStore.noteAssociation(context, 7, true)
        CompanionPresenceStore.noteAssociation(context, 9, true)
        assertEquals(setOf(7, 9), CompanionPresenceStore.presentAssociationIds(context))

        CompanionPresenceStore.retainAssociations(context, setOf(9), emptySet())
        assertEquals(setOf(9), CompanionPresenceStore.presentAssociationIds(context))

        CompanionPresenceStore.noteAssociation(context, 9, false)
        assertTrue(CompanionPresenceStore.presentAssociationIds(context).isEmpty())
    }

    fun testPresenceCacheCanBeClearedWithoutRemovingAndroidAssociation() {
        val context = instrumentation.targetContext
        CompanionPresenceStore.noteAssociation(context, 12, true)
        assertEquals(setOf(12), CompanionPresenceStore.presentAssociationIds(context))
        CompanionPresenceStore.clearPresence(context)
        assertTrue(CompanionPresenceStore.presentAssociationIds(context).isEmpty())
    }

    fun testLegacyCompanionAddressIsPrivacyReducedBeforePersistence() {
        val context = instrumentation.targetContext
        val raw = "AA:BB:CC:DD:EE:FF"
        CompanionPresenceStore.noteLegacyAddress(context, raw, true)

        val prefs = context.getSharedPreferences("brick_companion_presence", 0)
        assertTrue(prefs.all.isNotEmpty())
        assertFalse(prefs.all.keys.any { it.contains(raw, ignoreCase = true) })
        assertEquals(1, CompanionPresenceStore.presentLegacyIds(context).size)

        CompanionPresenceStore.noteLegacyAddress(context, raw, false)
        assertTrue(CompanionPresenceStore.presentLegacyIds(context).isEmpty())
    }

    fun testObservationRegistryAllowsSameDeviceAfterRemovalAndReassociation() {
        val registry = CompanionObservationRegistry()
        val address = "AA:BB:CC:DD:EE:FF"

        registry.reconcile(setOf(address))
        assertTrue(registry.markStartRequested(address))
        assertFalse(registry.markStartRequested(address))

        // Android no longer reports this association. Forget only Brick's process-local subscription
        // bookkeeping so the same explicitly authorised device can be re-associated later.
        registry.reconcile(emptySet())
        registry.reconcile(setOf(address))
        assertTrue(registry.markStartRequested(address))
    }

    fun testObservationRegistryRetriesAfterStartFailure() {
        val registry = CompanionObservationRegistry()
        val address = "11:22:33:44:55:66"

        registry.reconcile(setOf(address))
        assertTrue(registry.markStartRequested(address))
        registry.markStartFailed(address)
        assertTrue(registry.markStartRequested(address))
    }

    fun testCompanionAndChargingCannotManufactureIndependentConfirmations() {
        val atlas = EnvironmentalAtlas()
        val label = AtlasTrustedLabel("home-zone", 1.3000, 103.8000, 8f, 100_000L, baseWall)
        val deviceContext = listOf(
            AtlasSignalObservation(
                AtlasSignalKind.COMPANION,
                "comp:111111111111111111111111",
                "device.context",
                null,
                0.30f
            ),
            AtlasSignalObservation(
                AtlasSignalKind.CHARGING,
                "charge:usb",
                "device.context",
                72f,
                0.22f
            )
        )

        repeat(4) { visit ->
            val wall = baseWall + visit * 16L * 60L * 1_000L
            val elapsed = 100_000L + visit * 1_100_000L
            assertTrue(atlas.observeTrusted(
                label.copy(elapsedRealtimeMs = elapsed, wallTimeMs = wall),
                AtlasScan(elapsed + 100L, wall + 100L, 0.30f, deviceContext)
            ))
        }

        val matches = atlas.match(AtlasScan(
            5_000_000L,
            baseWall + 65L * 60L * 1_000L,
            0.30f,
            deviceContext
        ))
        // Correct behaviour is either no usable location candidate at all, or a deliberately weak
        // single-group candidate. Device context is never enough to manufacture a precise point.
        if (matches.isNotEmpty()) {
            val result = matches.first()
            assertEquals(1, result.independenceGroups)
            assertTrue(result.supportWeight <= 0.45)
            assertTrue(result.uncertaintyM >= 35f)
        }
    }
}
