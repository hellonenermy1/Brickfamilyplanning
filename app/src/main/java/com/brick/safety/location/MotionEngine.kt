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

enum class MotionSamplingProfile { LOW_POWER, NORMAL, DEGRADED, SOS }

class MotionEngine(private val context: Context) : SensorEventListener {
    companion object {
        private const val HEADING_STALE_NS = 10_000_000_000L
        private const val ROTATION_FOR_WORLD_STALE_NS = 2_000_000_000L
        private const val FALLBACK_GRAVITY_ALPHA = 0.92f
    }

    private val sensorManager = context.getSystemService(SensorManager::class.java)
    private val stepCounter = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    private val stepDetector = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
    private val rotationVector = sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val linearAcceleration = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
    private val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gravitySensor = sensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY)
    private val gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private val magneticField = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
    private val lightSensor = sensorManager.getDefaultSensor(Sensor.TYPE_LIGHT)
    private val proximitySensor = sensorManager.getDefaultSensor(Sensor.TYPE_PROXIMITY)

    private val totalSteps = AtomicLong(0)
    private val usingStepCounter = stepCounter != null
    private val processor = Phase3SignalProcessor()
    private val rotationMatrix = FloatArray(9)
    private val fallbackGravity = FloatArray(3)
    private val hardwareGravity = FloatArray(3)

    @Volatile private var headingDeg: Float? = null
    @Volatile private var lastHeadingElapsedNs: Long = 0L
    @Volatile private var lastStepElapsedNs: Long = 0L
    @Volatile private var lastRotationElapsedNs: Long = 0L
    @Volatile private var started = false
    @Volatile private var samplingProfile = MotionSamplingProfile.NORMAL
    @Volatile private var hardwareGravityFreshNs = 0L
    @Volatile private var magneticAccuracy = SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM

    init {
        processor.setAvailability(
            accel = linearAcceleration != null || accelerometer != null,
            gyro = gyroscope != null,
            magnetic = magneticField != null && rotationVector != null,
            rotation = rotationVector != null
        )
    }

    @Synchronized
    fun start() {
        if (started) return
        started = true
        registerStepSensors()
        registerContinuousSensors()
    }

    @Synchronized
    fun stop() {
        started = false
        sensorManager.unregisterListener(this)
    }

    @Synchronized
    fun setSamplingProfile(profile: MotionSamplingProfile) {
        if (samplingProfile == profile) return
        samplingProfile = profile
        if (!started) return
        unregisterContinuousSensors()
        registerContinuousSensors()
    }

    data class Snapshot(
        val totalSteps: Long,
        val headingDeg: Float?,
        val lastStepElapsedNs: Long,
        val headingAgeMs: Long? = null,
        val headingSource: String? = null
    )

    fun snapshot(): Snapshot {
        val nowNs = SystemClock.elapsedRealtimeNanos()
        val ageNs = nowNs - lastHeadingElapsedNs
        // Rotation-vector azimuth is magnetic, not a calibrated true-north bearing or the
        // person's travel direction. Do not advertise an angle after signal loss/interference.
        val heading = headingDeg.takeIf {
            lastHeadingElapsedNs > 0L && ageNs in 0L..HEADING_STALE_NS &&
                magneticAccuracy != SensorManager.SENSOR_STATUS_UNRELIABLE
        }
        return Snapshot(
            totalSteps.get(), heading, lastStepElapsedNs,
            headingAgeMs = heading?.let { ageNs / 1_000_000L },
            headingSource = heading?.let { "android_rotation_vector_magnetic" }
        )
    }

    @Synchronized
    fun phase3Snapshot(nowNs: Long = SystemClock.elapsedRealtimeNanos()): Phase3MotionSnapshot = processor.snapshot(nowNs)

    @Synchronized
    fun magneticSequence(nowNs: Long = SystemClock.elapsedRealtimeNanos()): List<MagneticPoint> = processor.magneticSequence(nowNs)

    @Synchronized
    fun recentLandmarks(nowNs: Long = SystemClock.elapsedRealtimeNanos()): List<LandmarkEvent> = processor.recentLandmarks(nowNs)

    @Synchronized
    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_STEP_COUNTER -> {
                val counter = event.values.firstOrNull()?.takeIf { it.isFinite() && it >= 0f }?.roundToLong() ?: return
                totalSteps.set(counter)
                lastStepElapsedNs = event.timestamp
                processor.onStepTotal(event.timestamp, counter)
            }
            Sensor.TYPE_STEP_DETECTOR -> {
                if (!usingStepCounter && event.values.firstOrNull() == 1f) {
                    val counter = totalSteps.incrementAndGet()
                    lastStepElapsedNs = event.timestamp
                    processor.onStepTotal(event.timestamp, counter)
                }
            }
            Sensor.TYPE_ROTATION_VECTOR -> {
                SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
                val orientation = FloatArray(3)
                SensorManager.getOrientation(rotationMatrix, orientation)
                var degrees = orientation[0] * 180f / PI.toFloat()
                if (degrees < 0f) degrees += 360f
                headingDeg = degrees
                lastHeadingElapsedNs = event.timestamp
                lastRotationElapsedNs = event.timestamp
                processor.onOrientation(event.timestamp, degrees)
            }
            Sensor.TYPE_LINEAR_ACCELERATION -> {
                val world = rotateDeviceToWorld(event.timestamp, event.values) ?: return
                processor.onLinearAcceleration(event.timestamp, world[0], world[1], world[2])
            }
            Sensor.TYPE_GRAVITY -> {
                if (event.values.size >= 3) {
                    hardwareGravity[0] = event.values[0]
                    hardwareGravity[1] = event.values[1]
                    hardwareGravity[2] = event.values[2]
                    hardwareGravityFreshNs = event.timestamp
                }
            }
            Sensor.TYPE_ACCELEROMETER -> {
                if (linearAcceleration != null || event.values.size < 3) return
                val gravity = if (gravitySensor != null && event.timestamp >= hardwareGravityFreshNs && event.timestamp - hardwareGravityFreshNs <= 1_000_000_000L) {
                    hardwareGravity
                } else {
                    for (i in 0..2) fallbackGravity[i] = FALLBACK_GRAVITY_ALPHA * fallbackGravity[i] + (1f - FALLBACK_GRAVITY_ALPHA) * event.values[i]
                    fallbackGravity
                }
                val linear = floatArrayOf(event.values[0] - gravity[0], event.values[1] - gravity[1], event.values[2] - gravity[2])
                val world = rotateDeviceToWorld(event.timestamp, linear) ?: return
                processor.onLinearAcceleration(event.timestamp, world[0], world[1], world[2])
            }
            Sensor.TYPE_GYROSCOPE -> if (event.values.size >= 3) {
                processor.onGyroscope(event.timestamp, event.values[0], event.values[1], event.values[2])
            }
            Sensor.TYPE_MAGNETIC_FIELD -> if (event.values.size >= 3 && magneticAccuracy != SensorManager.SENSOR_STATUS_UNRELIABLE) {
                val world = rotateDeviceToWorld(event.timestamp, event.values) ?: return
                processor.onMagnetic(event.timestamp, world[0], world[1], world[2])
            }
            Sensor.TYPE_LIGHT -> event.values.firstOrNull()?.let { processor.onLight(event.timestamp, it) }
            Sensor.TYPE_PROXIMITY -> event.values.firstOrNull()?.let { processor.onProximity(event.timestamp, it) }
        }
    }

    @Synchronized
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        if (sensor?.type == Sensor.TYPE_MAGNETIC_FIELD) magneticAccuracy = accuracy
    }

    private fun registerStepSensors() {
        if (!hasActivityPermission()) return
        runCatching {
            if (usingStepCounter) stepCounter?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
            else stepDetector?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
        }
    }

    private fun continuousDelay(): Int = when (samplingProfile) {
        MotionSamplingProfile.LOW_POWER -> SensorManager.SENSOR_DELAY_NORMAL
        MotionSamplingProfile.NORMAL -> SensorManager.SENSOR_DELAY_UI
        MotionSamplingProfile.DEGRADED, MotionSamplingProfile.SOS -> SensorManager.SENSOR_DELAY_GAME
    }

    private fun registerContinuousSensors() {
        val delay = continuousDelay()
        listOf(rotationVector, linearAcceleration, gyroscope, magneticField).forEach { sensor ->
            sensor?.let { runCatching { sensorManager.registerListener(this, it, delay) } }
        }
        if (linearAcceleration == null) {
            gravitySensor?.let { runCatching { sensorManager.registerListener(this, it, delay) } }
            accelerometer?.let { runCatching { sensorManager.registerListener(this, it, delay) } }
        }
        lightSensor?.let { runCatching { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) } }
        proximitySensor?.let { runCatching { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) } }
    }

    private fun unregisterContinuousSensors() {
        listOf(rotationVector, linearAcceleration, gravitySensor, accelerometer, gyroscope, magneticField, lightSensor, proximitySensor)
            .forEach { it?.let { sensor -> runCatching { sensorManager.unregisterListener(this, sensor) } } }
    }

    private fun rotateDeviceToWorld(eventNs: Long, values: FloatArray): FloatArray? {
        if (values.size < 3 || lastRotationElapsedNs <= 0L || eventNs < lastRotationElapsedNs || eventNs - lastRotationElapsedNs > ROTATION_FOR_WORLD_STALE_NS) return null
        val x = values[0]; val y = values[1]; val z = values[2]
        // Android's rotation matrix transforms device coordinates into the East/North/Up world frame.
        return floatArrayOf(
            rotationMatrix[0] * x + rotationMatrix[1] * y + rotationMatrix[2] * z,
            rotationMatrix[3] * x + rotationMatrix[4] * y + rotationMatrix[5] * z,
            rotationMatrix[6] * x + rotationMatrix[7] * y + rotationMatrix[8] * z
        )
    }

    private fun hasActivityPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED
}
