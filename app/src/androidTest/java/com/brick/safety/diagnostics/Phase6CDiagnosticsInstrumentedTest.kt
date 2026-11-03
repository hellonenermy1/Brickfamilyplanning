package com.brick.safety.diagnostics

import android.content.Context
import com.brick.safety.data.SafetyOutbox
import com.brick.safety.managed.DesiredLocationState
import com.brick.safety.managed.ParentLocationStateStore
import com.brick.safety.reliability.SafetyDispatcher
import com.brick.safety.testing.BrickInstrumentationTestCase

@Suppress("DEPRECATION")
class Phase6CDiagnosticsInstrumentedTest : BrickInstrumentationTestCase() {
    private lateinit var context: Context

    override fun setUp() {
        super.setUp()
        context = instrumentation.targetContext.applicationContext
        context.getSharedPreferences("brick_position", Context.MODE_PRIVATE).edit()
            .putLong("anchorWallMs", System.currentTimeMillis())
            .putLong("anchorLatBits", 1.352083.toBits())
            .putLong("anchorLonBits", 103.819836.toBits())
            .putFloat("anchorAccuracyM", 12.5f)
            .putFloat("anchorSpeedMps", 3.0f)
            .commit()
        DiagnosticStore.init(context)
    }

    override fun tearDown() {
        if (DiagnosticStore.activeSessionId() != null) DiagnosticStore.endSession(context)
        context.getSharedPreferences("brick_parent_location", Context.MODE_PRIVATE).edit().clear().commit()
        context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit()
            .remove("sosActive")
            .remove("fallHighActive")
            .remove("fallHighUntilMs")
            .commit()
        context.deleteDatabase("brick_safety_outbox.db")
        SafetyDispatcher.restoreSafetyMirrors(context)
        context.deleteDatabase("brick_safety_outbox.db")
        super.tearDown()
    }

    fun testReportCapturesSessionAndFullErrorWithoutCoordinates() {
        val session = DiagnosticStore.startSession(context)
        val failure = IllegalStateException("phase6c-test-error")
        DiagnosticStore.log(
            context,
            DiagnosticStore.Severity.ERROR,
            "test",
            "synthetic_failure",
            "diagnostic marker only",
            failure
        )

        val report = DiagnosticStore.fullReport(context)
        assertTrue(report.contains(session))
        assertTrue(report.contains("synthetic_failure"))
        assertTrue(report.contains("phase6c-test-error"))
        assertTrue(report.contains("accuracy=12.5m"))
        assertTrue(report.contains("speed=10.8km/h"))

        // Coordinates may exist in Brick's encrypted/position stores, but the diagnostic black box
        // deliberately reports only age/accuracy/speed/quality context.
        assertFalse(report.contains("1.352083"))
        assertFalse(report.contains("103.819836"))
    }

    fun testDiagnosticStorageBoundaryRedactsIdentifiersTokensKeysUrlsAndCoordinates() {
        val deviceId = "11111111-1111-4111-8111-111111111111"
        val jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJhdWRpdC10ZXN0LWRldmljZSJ9.signature_test_1234567890"
        val signature = "MEUCIQDx2m6uZ9V1w9Jx8Vw3L4k8m8q8t2QqV7s0f2sK3gIgQ2w0r9k0M6z9s7x5n4p2q1r8v6t4y2u0i8o6p4n2m0A="
        val key = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEWm9uZVNlbnNpdGl2ZUtleU1hdGVyaWFsVGVzdA=="
        val rawUrl = "https://brick.example/api/device/$deviceId/location?token=secret-query-value"
        val exactLat = "1.352083"
        val exactLon = "103.819836"

        val detail = "device=$deviceId lat=$exactLat lon=$exactLon Authorization: Bearer $jwt X-Brick-Signature=$signature publicKey=$key url=$rawUrl"
        val failure = IllegalStateException(
            "transport failed pairingToken=another-secret at $rawUrl coordinates $exactLat,$exactLon device=$deviceId"
        )
        DiagnosticStore.log(
            context,
            DiagnosticStore.Severity.ERROR,
            "test",
            "sensitive_redaction_probe",
            detail,
            failure
        )

        val report = DiagnosticStore.fullReport(context)
        assertTrue(report.contains("sensitive_redaction_probe"))
        assertTrue(report.contains("<redacted>") || report.contains("<token>"))
        assertTrue(report.contains("<url>"))
        assertTrue(report.contains("<coord>") || report.contains("<coordinates>"))
        assertTrue(report.contains("<id>"))

        for (sensitive in listOf(deviceId, jwt, signature, key, rawUrl, exactLat, exactLon, "another-secret", "secret-query-value")) {
            assertFalse("diagnostic report leaked: $sensitive", report.contains(sensitive))
        }
    }

    fun testManualMarkersAreBoundToActiveSession() {
        val session = DiagnosticStore.startSession(context)
        val marker = DiagnosticStore.addMarker(context)
        val report = DiagnosticStore.fullReport(context)
        assertTrue(marker > 0)
        assertTrue(report.contains("manual_marker"))
        assertTrue(report.contains("marker=$marker"))
        assertTrue(report.contains("session=$session"))
    }

    fun testReportUsesV1OneShotLocationSemanticsAndDurableSosTruth() {
        val now = System.currentTimeMillis()
        context.getSharedPreferences("brick_parent_location", Context.MODE_PRIVATE).edit().clear().commit()
        assertTrue(
            ParentLocationStateStore.applyVerified(
                context = context,
                desired = DesiredLocationState.OFF,
                commandId = "diag-command-0001",
                nonce = "11111111-1111-4111-8111-111111111111",
                issuedAtMs = now - 1_000L,
                expiresAtMs = now + 5 * 60_000L,
                nowMs = now
            )
        )

        context.deleteDatabase("brick_safety_outbox.db")
        SafetyOutbox(context).use { outbox ->
            assertTrue(
                outbox.appendSosTransition(
                    eventId = "22222222-2222-4222-8222-222222222222",
                    kind = "sos_started",
                    payload = "diagnostic-sos-state".toByteArray(),
                    priority = SafetyDispatcher.PRIORITY_SOS,
                    active = true
                )
            )
        }

        // Populate SafetyDispatcher's cache from the durable outbox, then deliberately make the old
        // compatibility preference disagree. The diagnostic report must continue to show durable
        // SOS truth rather than regress to the compatibility mirror.
        SafetyDispatcher.restoreSafetyMirrors(context)
        assertTrue(context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit().putBoolean("sosActive", false).commit())

        val report = DiagnosticStore.fullReport(context)
        assertEquals("BRICK V1 DIAGNOSTIC REPORT", report.lineSequence().first())
        assertTrue(report.contains("sosActive=true"))
        val locationLine = report.lineSequence().first { it.startsWith("locationEnabled=") }
        assertTrue(locationLine.contains("lastCommandTarget=OFF"))
        assertTrue(locationLine.contains("lastCommandStatus=PENDING"))
        assertTrue(locationLine.contains("lastCommandActualAfter=unknown"))
        assertFalse("one-shot Location history must not be described as persistent desired state", locationLine.contains("desired="))
        assertFalse(report.contains("BRICK PHASE 6C BETA DIAGNOSTIC REPORT"))
    }
}
