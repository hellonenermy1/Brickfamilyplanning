package com.brick.safety.location

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.PI

class MotionEngine(context: Context) : SensorEventListener {
    companion object { private const val HEADING_STALE_NS = 10_000_000_000L }

    private val sensorManager = context.getSystemService(SensorManager::class.java)
    private val stepDetector = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
    private val rotationVector = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val totalSteps = AtomicLong(0)
    @Volatile private var headingDeg: Float? = null
    @Volatile private var lastHeadingElapsedNs: Long = 0L
    @Volatile private var lastStepElapsedNs: Long = 0L

    fun start() {
        stepDetector?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
        rotationVector?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
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
            Sensor.TYPE_STEP_DETECTOR -> {
                if (event.values.firstOrNull() == 1f) {
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
}
