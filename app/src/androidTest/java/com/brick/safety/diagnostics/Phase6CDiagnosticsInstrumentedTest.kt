package com.brick.safety.diagnostics

import android.content.Context
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

    fun testManualMarkersAreBoundToActiveSession() {
        val session = DiagnosticStore.startSession(context)
        val marker = DiagnosticStore.addMarker(context)
        val report = DiagnosticStore.fullReport(context)
        assertTrue(marker > 0)
        assertTrue(report.contains("manual_marker"))
        assertTrue(report.contains("marker=$marker"))
        assertTrue(report.contains("session=$session"))
    }
}
