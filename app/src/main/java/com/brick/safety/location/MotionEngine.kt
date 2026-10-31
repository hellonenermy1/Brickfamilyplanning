package com.brick.safety.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import androidx.core.content.ContextCompat
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.PI
import kotlin.math.roundToLong

class MotionEngine(private val context: Context) : SensorEventListener {
    companion object { private const val HEADING_STALE_NS = 10_000_000_000L }

    private val sensorManager = context.getSystemService(SensorManager::class.java)
    private val stepCounter = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    private val stepDetector = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
    private val rotationVector = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val totalSteps = AtomicLong(0)
    private val usingStepCounter = stepCounter != null
    @Volatile private var headingDeg: Float? = null
    @Volatile private var lastHeadingElapsedNs: Long = 0L
    @Volatile private var lastStepElapsedNs: Long = 0L

    fun start() {
        if (hasActivityPermission()) {
            runCatching {
                if (usingStepCounter) stepCounter?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
                else stepDetector?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
            }
        }
        rotationVector?.let { runCatching { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) } }
    }

    fun stop() = sensorManager.unregisterListener(this)

    data class Snapshot(
        val totalSteps: Long,
        val headingDeg: Float?,
        val lastStepElapsedNs: Long
    )

    fun snapshot(): Snapshot {
        val nowNs = SystemClock.elapsedRealtimeNanos()
        val heading = headingDeg.takeIf {
            lastHeadingElapsedNs > 0L && lastHeadingElapsedNs <= nowNs && nowNs - lastHeadingElapsedNs <= HEADING_STALE_NS
        }
        return Snapshot(totalSteps.get(), heading, lastStepElapsedNs)
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_STEP_COUNTER -> {
                val counter = event.values.firstOrNull()?.takeIf { it.isFinite() && it >= 0f }?.roundToLong() ?: return
                totalSteps.set(counter)
                lastStepElapsedNs = event.timestamp
            }
            Sensor.TYPE_STEP_DETECTOR -> {
                if (!usingStepCounter && event.values.firstOrNull() == 1f) {
                    totalSteps.incrementAndGet()
                    lastStepElapsedNs = event.timestamp
                }
            }
            Sensor.TYPE_ROTATION_VECTOR -> {
                val matrix = FloatArray(9)
                val orientation = FloatArray(3)
                SensorManager.getRotationMatrixFromVector(matrix, event.values)
                SensorManager.getOrientation(matrix, orientation)
                var degrees = (orientation[0] * 180f / PI.toFloat())
                if (degrees < 0f) degrees += 360f
                headingDeg = degrees
                lastHeadingElapsedNs = event.timestamp
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun hasActivityPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
}
