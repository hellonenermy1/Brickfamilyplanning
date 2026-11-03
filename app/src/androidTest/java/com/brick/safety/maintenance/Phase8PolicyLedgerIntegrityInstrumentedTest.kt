package com.brick.safety.maintenance

import android.content.Context
import com.brick.safety.testing.BrickInstrumentationTestCase
import org.json.JSONArray
import org.json.JSONObject

class Phase8PolicyLedgerIntegrityInstrumentedTest : BrickInstrumentationTestCase() {
    companion object { private const val PREFS = "brick_policy_ledger_v1" }

    private lateinit var context: Context

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit()
    }

    override fun tearDown() {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit()
        super.tearDown()
    }

    fun testMissingLedgerFailsClosedButExplicitInitializedEmptyLedgerIsValid() {
        assertFalse(PolicyLedger.integrityValid(context))
        assertFalse(PolicyLedger.ensureReadyForPolicyMutation(context))
        assertNull(PolicyLedger.record(context, "auto_time", "false", "true", "test"))

        assertTrue(PolicyLedger.initializeManagedLifecycle(context))
        assertTrue(PolicyLedger.integrityValid(context))
        assertTrue(PolicyLedger.active(context).isEmpty())

        val id = PolicyLedger.record(context, "auto_time", "false", "true", "test")
        assertNotNull(id)
        assertEquals(1, PolicyLedger.active(context).size)
    }

    fun testMalformedOrDeletedRecordsCannotBeBlessedByRuntimeMigration() {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        assertTrue(prefs.edit().putString("records", "not-json").commit())
        assertFalse(PolicyLedger.ensureReadyForPolicyMutation(context))
        assertFalse(PolicyLedger.integrityValid(context))

        assertTrue(prefs.edit().clear().putBoolean("initialized", true).putInt("schema", 1).commit())
        assertFalse(PolicyLedger.integrityValid(context))
        assertFalse(PolicyLedger.ensureReadyForPolicyMutation(context))
    }

    fun testStructurallyValidLegacyRecordsCanAddMarkerWithoutLosingProvenance() {
        val entry = JSONObject()
            .put("id", "11111111-1111-4111-8111-111111111111")
            .put("policy", "auto_time")
            .put("previousValue", "false")
            .put("brickValue", "true")
            .put("appliedAtMs", 1_700_000_000_000L)
            .put("source", "legacy")
            .put("revertedAtMs", JSONObject.NULL)
        assertTrue(
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("records", JSONArray().put(entry).toString())
                .commit()
        )

        assertFalse(PolicyLedger.integrityValid(context))
        assertTrue(PolicyLedger.ensureReadyForPolicyMutation(context))
        assertTrue(PolicyLedger.integrityValid(context))
        assertEquals("auto_time", PolicyLedger.active(context).single().policy)
    }

    fun testActiveProvenanceSurvivesHeavyRevertedHistoryChurn() {
        assertTrue(PolicyLedger.initializeManagedLifecycle(context))
        val protectedId = PolicyLedger.record(
            context,
            "restriction:no_config_date_time",
            "false",
            "true",
            "protected"
        )
        assertNotNull(protectedId)

        for (i in 0 until 400) {
            val id = PolicyLedger.record(context, "permission:test_$i", "0", "1", "churn")
            assertNotNull("ledger should compact reverted history at index $i", id)
            assertTrue(PolicyLedger.markReverted(context, id!!))
        }

        val active = PolicyLedger.active(context)
        assertEquals(1, active.size)
        assertEquals(protectedId, active.single().id)
        assertEquals("restriction:no_config_date_time", active.single().policy)
        assertTrue(PolicyLedger.integrityValid(context))
    }
}
