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
 * (peak impact/rotation, post-impact motion and activity context), never a raw sensor recording.
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
        val p = context.applicationContext.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val until = p.getLong("fallHighUntilMs", 0L)
        if (until <= System.currentTimeMillis()) p.edit().putBoolean("fallHighActive", false).remove("fallHighUntilMs").apply()
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
            val detail = JSONObject()
                .put("confidence", confidence.name.lowercase())
                .put("peakImpactG", String.format(java.util.Locale.US, "%.2f", peakImpactG).toDouble())
                .put("peakGyroRadS", String.format(java.util.Locale.US, "%.2f", peakGyro).toDouble())
                .put("postImpactMotion", String.format(java.util.Locale.US, "%.3f", postMotion).toDouble())
                .put("stillAfterImpact", stillAfterImpact)
                .put("rotationCorroborated", rotated)
                .put("activityMode", activity.mode.name.lowercase())
                .put("activityConfidence", activity.confidence)
                .put("evidence", "privacy_minimized_aggregate_no_raw_sensor_stream")
            val priority = when (confidence) {
                Confidence.HIGH -> SafetyDispatcher.PRIORITY_CRITICAL
                Confidence.MEDIUM -> SafetyDispatcher.PRIORITY_IMPORTANT
                Confidence.LOW -> SafetyDispatcher.PRIORITY_NORMAL
            }
            val saved = SafetyDispatcher.enqueue(context, "fall_detected", detail, priority) != null
            if (saved && confidence == Confidence.HIGH) {
                context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit()
                    .putBoolean("fallHighActive", true)
                    .putLong("fallHighUntilMs", System.currentTimeMillis() + HIGH_PROTECTION_MS)
                    .apply()
            }
            DiagnosticStore.log(context, if (confidence == Confidence.HIGH) DiagnosticStore.Severity.ERROR else DiagnosticStore.Severity.WARN,
                "fall", "fall_candidate_saved", "confidence=${confidence.name} impactG=$peakImpactG gyro=$peakGyro postMotion=$postMotion saved=$saved")
        }
        resetCandidate()
    }

    private fun resetCandidate() {
        candidateAtElapsed = 0L; peakImpactG = 0f; peakGyro = 0f; postMotionSamples = 0; postMotionSum = 0f
    }

    private fun magnitude(v: FloatArray): Float {
        val x = v.getOrElse(0) { 0f }; val y = v.getOrElse(1) { 0f }; val z = v.getOrElse(2) { 0f }
        return sqrt(x * x + y * y + z * z)
    }
}
