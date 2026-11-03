package com.brick.safety.reliability

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import com.brick.safety.activity.ActivityState
import com.brick.safety.diagnostics.DiagnosticStore
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.maintenance.DeviceRoleStore
import org.json.JSONObject
import kotlin.math.sqrt

/**
 * Conservative local fall inference. The durable safety envelope stores only aggregate features
 * (peak impact/rotation, post-impact motion and bounded health context), never a raw sensor recording.
 */
object FallDetectorRuntime : SensorEventListener {
    enum class Confidence { LOW, MEDIUM, HIGH }

    private const val G = 9.80665f
    private const val IMPACT_LOW_G = 2.7f
    private const val IMPACT_MEDIUM_G = 3.2f
    private const val IMPACT_HIGH_G = 4.0f
    private const val GYRO_CORROBORATE = 2.2f
    private const val EVALUATE_DELAY_MS = 3_000L
    private const val CANDIDATE_COOLDOWN_MS = 45_000L
    private const val HIGH_PROTECTION_MS = 2 * 60_000L

    private var app: Context? = null
    private var manager: SensorManager? = null
    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var started = false
    private var candidateAtElapsed = 0L
    private var lastCandidateElapsed = 0L
    private var peakImpactG = 0f
    private var peakGyro = 0f
    private var postMotionSamples = 0
    private var postMotionSum = 0f

    @Synchronized
    fun start(context: Context) {
        val application = context.applicationContext
        refreshHighAlert(application)
        if (started || DeepOffManager.isActive(application) || DeviceRoleStore.role(application) != DeviceRoleStore.Role.CHILD) return
        val sm = application.getSystemService(SensorManager::class.java)
        val accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
        val gyro = sm.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
        val ht = HandlerThread("brick-fall-inference").also { it.start() }
        val h = Handler(ht.looper)
        app = application; manager = sm; thread = ht; handler = h; started = true
        sm.registerListener(this, accel, SensorManager.SENSOR_DELAY_GAME, h)
        if (gyro != null) sm.registerListener(this, gyro, SensorManager.SENSOR_DELAY_GAME, h)
    }

    @Synchronized
    fun stop() {
        if (!started) return
        manager?.unregisterListener(this)
        handler?.removeCallbacksAndMessages(null)
        thread?.quitSafely()
        started = false; manager = null; handler = null; thread = null; app = null
        resetCandidate()
    }

    fun clearHighAlert(context: Context) {
        context.applicationContext.getSharedPreferences("brick", Context.MODE_PRIVATE).edit()
            .putBoolean("fallHighActive", false).remove("fallHighUntilMs").apply()
    }

    fun refreshHighAlert(context: Context) {
        val app = context.applicationContext
        val until = SafetyDispatcher.highFallUntilMs(app)
        app.getSharedPreferences("brick", Context.MODE_PRIVATE).edit()
            .putBoolean("fallHighActive", until > System.currentTimeMillis())
            .putLong("fallHighUntilMs", until)
            .apply()
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!started) return
        val now = SystemClock.elapsedRealtime()
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> {
                val magnitudeG = magnitude(event.values) / G
                if (candidateAtElapsed == 0L && magnitudeG >= IMPACT_LOW_G && (lastCandidateElapsed == 0L || now - lastCandidateElapsed >= CANDIDATE_COOLDOWN_MS)) {
                    candidateAtElapsed = now
                    lastCandidateElapsed = now
                    peakImpactG = magnitudeG
                    peakGyro = 0f
                    postMotionSamples = 0
                    postMotionSum = 0f
                    handler?.postDelayed({ evaluateCandidate() }, EVALUATE_DELAY_MS)
                } else if (candidateAtElapsed > 0L) {
                    peakImpactG = maxOf(peakImpactG, magnitudeG)
                    if (now > candidateAtElapsed + 500L) {
                        postMotionSamples++
                        postMotionSum += kotlin.math.abs(magnitudeG - 1f)
                    }
                }
            }
            Sensor.TYPE_GYROSCOPE -> if (candidateAtElapsed > 0L) peakGyro = maxOf(peakGyro, magnitude(event.values))
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun evaluateCandidate() {
        val context = app ?: return resetCandidate()
        if (candidateAtElapsed == 0L) return
        val postMotion = if (postMotionSamples > 0) postMotionSum / postMotionSamples else 1f
        val stillAfterImpact = postMotion < 0.28f
        val rotated = peakGyro >= GYRO_CORROBORATE
        val activity = ActivityState.read(context)
        val impossibleContext = activity.mode.name == "VEHICLE" && activity.confidence >= 80 && peakImpactG < IMPACT_HIGH_G

        val confidence = when {
            impossibleContext -> null
            peakImpactG >= IMPACT_HIGH_G && rotated && stillAfterImpact -> Confidence.HIGH
            peakImpactG >= IMPACT_MEDIUM_G && (rotated || stillAfterImpact) -> Confidence.MEDIUM
            peakImpactG >= IMPACT_LOW_G -> Confidence.LOW
            else -> null
        }

        if (confidence != null) {
            val detail = emergencyEvidence(context, confidence, postMotion, stillAfterImpact, rotated, activity.mode.name.lowercase(), activity.confidence)

            // SAFE-009: LOW is evidence for local tuning/diagnostics only. It must never enter the
            // parent-facing safety outbox or create routine parent/child alarm spam.
            if (confidence == Confidence.LOW) {
                DiagnosticStore.log(
                    context,
                    DiagnosticStore.Severity.INFO,
                    "fall",
                    "low_candidate_local_only",
                    "impactG=$peakImpactG gyro=$peakGyro postMotion=$postMotion activity=${activity.mode.name}"
                )
                resetCandidate()
                return
            }

            val saved = if (confidence == Confidence.HIGH) {
                val highUntilMs = System.currentTimeMillis() + HIGH_PROTECTION_MS
                SafetyDispatcher.enqueueHighFall(context, detail, highUntilMs) != null
            } else {
                SafetyDispatcher.enqueue(
                    context,
                    "fall_detected",
                    detail,
                    SafetyDispatcher.PRIORITY_IMPORTANT
                ) != null
            }
            DiagnosticStore.log(
                context,
                if (confidence == Confidence.HIGH) DiagnosticStore.Severity.ERROR else DiagnosticStore.Severity.WARN,
                "fall",
                "fall_candidate_saved",
                "confidence=${confidence.name} impactG=$peakImpactG gyro=$peakGyro postMotion=$postMotion saved=$saved"
            )
        }
        resetCandidate()
    }

    /**
     * Bounded, privacy-minimized emergency context assembled only from state Brick already keeps.
     * No microphone/camera data and no raw accelerometer/gyro stream is retained.
     */
    private fun emergencyEvidence(
        context: Context,
        confidence: Confidence,
        postMotion: Float,
        stillAfterImpact: Boolean,
        rotated: Boolean,
        activityMode: String,
        activityConfidence: Int
    ): JSONObject {
        val now = System.currentTimeMillis()
        val position = context.getSharedPreferences("brick_position", Context.MODE_PRIVATE)
        val diag = context.getSharedPreferences("brick_diag_state", Context.MODE_PRIVATE)
        val brick = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val anchorWall = position.getLong("anchorWallMs", 0L)
        val speed = position.getFloat("anchorSpeedMps", Float.NaN)
        val accuracy = position.getFloat("anchorAccuracyM", Float.NaN)

        return JSONObject()
            .put("confidence", confidence.name.lowercase())
            .put("peakImpactG", String.format(java.util.Locale.US, "%.2f", peakImpactG).toDouble())
            .put("peakGyroRadS", String.format(java.util.Locale.US, "%.2f", peakGyro).toDouble())
            .put("postImpactMotion", String.format(java.util.Locale.US, "%.3f", postMotion).toDouble())
            .put("stillAfterImpact", stillAfterImpact)
            .put("rotationCorroborated", rotated)
            .put("activityMode", activityMode)
            .put("activityConfidence", activityConfidence.coerceIn(0, 100))
            .put("positionAgeMs", if (anchorWall > 0L && now >= anchorWall) now - anchorWall else JSONObject.NULL)
            .put("positionAccuracyM", if (accuracy.isFinite() && accuracy >= 0f) accuracy.toDouble() else JSONObject.NULL)
            .put("speedMps", if (speed.isFinite() && speed >= 0f) speed.toDouble() else JSONObject.NULL)
            .put("network", diag.getString("network", "unknown") ?: "unknown")
            .put("networkValidated", diag.getBoolean("networkValidated", false))
            .put("powerSave", diag.getBoolean("powerSave", false))
            .put("doze", diag.getBoolean("doze", false))
            .put("backgroundRestricted", diag.getBoolean("backgroundRestricted", false))
            .put("recoveryCount", diag.getInt("recoveryCount", brick.getInt("recoveryCount", 0)).coerceAtLeast(0))
            .put("journalWriteHealthy", brick.getBoolean("journalWriteHealthy", true))
            .put("safetyOutboxWriteHealthy", brick.getBoolean("safetyOutboxWriteHealthy", true))
            .put("evidence", "privacy_minimized_aggregate_no_raw_sensor_stream")
    }

    private fun resetCandidate() {
        candidateAtElapsed = 0L; peakImpactG = 0f; peakGyro = 0f; postMotionSamples = 0; postMotionSum = 0f
    }

    private fun magnitude(v: FloatArray): Float {
        val x = v.getOrElse(0) { 0f }; val y = v.getOrElse(1) { 0f }; val z = v.getOrElse(2) { 0f }
        return sqrt(x * x + y * y + z * z)
    }
}
