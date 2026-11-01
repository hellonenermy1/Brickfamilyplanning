package com.brick.safety.reliability

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.brick.safety.evidence.EvidenceJournal
import org.json.JSONObject

object HealthEvidence {
    fun collect(context: Context): JSONObject {
        val sensorManager = context.getSystemService(SensorManager::class.java)
        val powerManager = context.getSystemService(PowerManager::class.java)
        val activityManager = context.getSystemService(ActivityManager::class.java)
        val connectivity = context.getSystemService(ConnectivityManager::class.java)
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)

        val now = System.currentTimeMillis()
        val lastRecovery = prefs.getLong("lastSelfRecoveryWallMs", 0L)
        val lastJournalFailure = prefs.getLong("lastJournalWriteFailureWallMs", 0L)
        val lastSafetyOutboxFailure = prefs.getLong("lastSafetyOutboxWriteFailureWallMs", 0L)
        val lastEvidenceJournalFailure = prefs.getLong("lastEvidenceJournalFailureWallMs", 0L)
        val lastEvidenceIdentityChange = prefs.getLong("lastEvidenceIdentityChangeWallMs", 0L)
        val lastEvidenceServerConflict = prefs.getLong("lastEvidenceServerConflictWallMs", 0L)
        val lastEvidenceQuarantineCleanup = prefs.getLong("lastEvidenceQuarantineCleanupWallMs", 0L)
        val evidenceIdentityQuarantinedTotal = prefs.getLong("evidenceIdentityQuarantinedRecordsTotal", 0L).coerceAtLeast(0L)
        val evidenceServerConflictTotal = prefs.getLong("evidenceServerConflictRecordsTotal", 0L).coerceAtLeast(0L)
        val evidenceQuarantinePurgedTotal = prefs.getLong("evidenceQuarantinePurgedRecordsTotal", 0L).coerceAtLeast(0L)
        val evidenceUploadFailureStreak = prefs.getInt("evidenceUploadFailureStreak", 0).coerceAtLeast(0)
        val bleAnchorConfigCount = prefs.getInt("bleAnchorConfigCount", 0).coerceIn(0, 8)

        val lastPhase3StateFailure = prefs.getLong("lastPhase3StateFailureWallMs", 0L)
        val phase3StateFailureTotal = prefs.getLong("phase3StateFailureTotal", 0L).coerceAtLeast(0L)
        val lastPhase3RouteGraphFailure = prefs.getLong("lastPhase3RouteGraphFailureWallMs", 0L)
        val phase3RouteGraphFailureTotal = prefs.getLong("phase3RouteGraphFailureTotal", 0L).coerceAtLeast(0L)
        val lastPhase3ConsistencyReject = prefs.getLong("lastPhase3ConsistencyRejectWallMs", 0L)
        val phase3ConsistencyRejectTotal = prefs.getLong("phase3ConsistencyRejectTotal", 0L).coerceAtLeast(0L)

        val lastAtlasStateFailure = prefs.getLong("lastAtlasStateFailureWallMs", 0L)
        val atlasStateFailureTotal = prefs.getLong("atlasStateFailureTotal", 0L).coerceAtLeast(0L)

        val evidenceSnapshot = runCatching {
            EvidenceJournal(context).let { journal ->
                try {
                    val healthy = journal.refreshHealth()
                    journal.stats() to healthy
                } finally {
                    journal.close()
                }
            }
        }.getOrNull()
        val evidenceStats = evidenceSnapshot?.first
        val evidenceJournalHealthy = evidenceSnapshot?.second == true

        fun ageSince(wallMs: Long): Any = if (wallMs > 0L) (now - wallMs).coerceAtLeast(0L) else JSONObject.NULL
        fun optionalBoolean(key: String): Any = if (prefs.contains(key)) prefs.getBoolean(key, false) else JSONObject.NULL
        fun optionalFloat(key: String): Any = if (prefs.contains(key)) prefs.getFloat(key, 0f) else JSONObject.NULL
        fun optionalLong(key: String): Any = if (prefs.contains(key)) prefs.getLong(key, 0L).coerceAtLeast(0L) else JSONObject.NULL
        fun optionalString(key: String): Any = prefs.getString(key, null)?.take(80) ?: JSONObject.NULL

        val nextHealthSequence = prefs.getLong("healthSequence", 0L) + 1L
        val healthCounterWriteHealthy = prefs.edit().putLong("healthSequence", nextHealthSequence).commit()
        val healthSequence = if (healthCounterWriteHealthy) nextHealthSequence else 0L

        val activeNetwork = connectivity.activeNetwork
        val caps = activeNetwork?.let { connectivity.getNetworkCapabilities(it) }
        val networkValidated = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true

        fun granted(permission: String): Boolean =
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

        return JSONObject()
            .put("healthSequence", healthSequence)
            .put("healthSentAtMs", now)
            .put("healthCounterWriteHealthy", healthCounterWriteHealthy)
            .put("fineLocationPermission", granted(Manifest.permission.ACCESS_FINE_LOCATION))
            .put("backgroundLocationPermission", granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION))
            .put("activityRecognitionPermission", granted(Manifest.permission.ACTIVITY_RECOGNITION))
            .put("bleAnchorConfigCount", bleAnchorConfigCount)
            .put("bluetoothScanPermission", Build.VERSION.SDK_INT < 31 || granted(Manifest.permission.BLUETOOTH_SCAN))
            .put("nearbyWifiPermission", Build.VERSION.SDK_INT < 33 || granted(Manifest.permission.NEARBY_WIFI_DEVICES))
            .put("notificationPermission", Build.VERSION.SDK_INT < 33 || granted(Manifest.permission.POST_NOTIFICATIONS))
            .put("batteryOptimizationExempt", powerManager.isIgnoringBatteryOptimizations(context.packageName))
            .put("powerSaveMode", powerManager.isPowerSaveMode)
            .put("backgroundRestricted", activityManager.isBackgroundRestricted)
            .put("networkValidated", networkValidated)
            .put("dataSaverRestricted", connectivity.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED)
            .put("accelerometerAvailable", sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null)
            .put("gyroscopeAvailable", sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE) != null)
            .put("magnetometerAvailable", sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null)
            .put("rotationVectorAvailable", sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null)
            .put("stepCounterAvailable", sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null)
            .put("stepDetectorAvailable", sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR) != null)
            .put("lastSelfRecoveryAgeMs", ageSince(lastRecovery))
            .put("journalWriteHealthy", prefs.getBoolean("journalWriteHealthy", true))
            .put("lastJournalWriteFailureAgeMs", ageSince(lastJournalFailure))
            .put("safetyOutboxWriteHealthy", prefs.getBoolean("safetyOutboxWriteHealthy", true))
            .put("lastSafetyOutboxWriteFailureAgeMs", ageSince(lastSafetyOutboxFailure))
            .put("evidenceJournalHealthy", evidenceJournalHealthy)
            .put("lastEvidenceJournalFailureAgeMs", ageSince(lastEvidenceJournalFailure))
            .put("evidencePendingRecords", evidenceStats?.pendingCount ?: -1)
            .put("evidenceQuarantinedRecords", evidenceStats?.quarantinedCount ?: -1)
            .put("evidenceOldestPendingAgeMs", evidenceStats?.oldestPendingMs?.let { (now - it).coerceAtLeast(0L) } ?: JSONObject.NULL)
            .put("lastEvidenceIdentityChangeAgeMs", ageSince(lastEvidenceIdentityChange))
            .put("evidenceIdentityQuarantinedRecordsTotal", evidenceIdentityQuarantinedTotal)
            .put("lastEvidenceServerConflictAgeMs", ageSince(lastEvidenceServerConflict))
            .put("evidenceServerConflictRecordsTotal", evidenceServerConflictTotal)
            .put("lastEvidenceQuarantineCleanupAgeMs", ageSince(lastEvidenceQuarantineCleanup))
            .put("evidenceQuarantinePurgedRecordsTotal", evidenceQuarantinePurgedTotal)
            .put("evidenceUploadFailureStreak", evidenceUploadFailureStreak)
            .put("phase3Initialized", optionalBoolean("phase3Initialized"))
            .put("phase3RouteSegments", prefs.getInt("phase3RouteSegments", 0).coerceAtLeast(0))
            .put("phase3PrivateMapSegments", prefs.getInt("phase3PrivateMapSegments", 0).coerceAtLeast(0))
            .put("phase3LearnedRouteSegments", prefs.getInt("phase3LearnedRouteSegments", 0).coerceAtLeast(0))
            .put("phase3UncertaintyM", optionalFloat("phase3UncertaintyM"))
            .put("phase3AgeSinceTrustedMs", optionalLong("phase3AgeSinceTrustedMs"))
            .put("phase3RouteConstrained", optionalBoolean("phase3RouteConstrained"))
            .put("phase3StateHealthy", prefs.getBoolean("phase3StateHealthy", true))
            .put("lastPhase3StateFailureAgeMs", ageSince(lastPhase3StateFailure))
            .put("phase3StateFailureTotal", phase3StateFailureTotal)
            .put("phase3AccelerometerHealthy", optionalBoolean("phase3AccelerometerHealthy"))
            .put("phase3GyroscopeHealthy", optionalBoolean("phase3GyroscopeHealthy"))
            .put("phase3MagneticHealthy", optionalBoolean("phase3MagneticHealthy"))
            .put("phase3RotationHealthy", optionalBoolean("phase3RotationHealthy"))
            .put("phase3RouteGraphHealthy", optionalBoolean("phase3RouteGraphHealthy"))
            .put("lastPhase3RouteGraphFailureAgeMs", ageSince(lastPhase3RouteGraphFailure))
            .put("phase3RouteGraphFailureTotal", phase3RouteGraphFailureTotal)
            .put("lastPhase3ConsistencyRejectAgeMs", ageSince(lastPhase3ConsistencyReject))
            .put("phase3ConsistencyRejectTotal", phase3ConsistencyRejectTotal)
            .put("lastPhase3ConsistencyRejectReason", optionalString("lastPhase3ConsistencyRejectReason"))
            .put("atlasStateHealthy", prefs.getBoolean("atlasStateHealthy", true))
            .put("lastAtlasStateFailureAgeMs", ageSince(lastAtlasStateFailure))
            .put("atlasStateFailureTotal", atlasStateFailureTotal)
            .put("atlasLabelCount", prefs.getInt("atlasLabelCount", 0).coerceAtLeast(0))
            .put("atlasSignalCount", prefs.getInt("atlasSignalCount", 0).coerceAtLeast(0))
            .put("atlasCandidateCount", prefs.getInt("atlasCandidateCount", 0).coerceAtLeast(0))
            .put("atlasCandidateAmbiguous", optionalBoolean("atlasCandidateAmbiguous"))
            .put("atlasCandidateUncertaintyM", optionalFloat("atlasCandidateUncertaintyM"))
            .put("atlasWifiProviderCapability", optionalString("atlasWifiProviderCapability"))
            .put("atlasWifiProviderHealth", optionalString("atlasWifiProviderHealth"))
            .put("atlasRttProviderCapability", optionalString("atlasRttProviderCapability"))
            .put("atlasRttProviderHealth", optionalString("atlasRttProviderHealth"))
            .put("atlasBleProviderCapability", optionalString("atlasBleProviderCapability"))
            .put("atlasBleProviderHealth", optionalString("atlasBleProviderHealth"))
            .put("atlasCellularProviderCapability", optionalString("atlasCellularProviderCapability"))
            .put("atlasCellularProviderHealth", optionalString("atlasCellularProviderHealth"))
            .put("atlasLanProviderCapability", optionalString("atlasLanProviderCapability"))
            .put("atlasLanProviderHealth", optionalString("atlasLanProviderHealth"))
            .put("atlasGnssProviderCapability", optionalString("atlasGnssProviderCapability"))
            .put("atlasGnssProviderHealth", optionalString("atlasGnssProviderHealth"))
            .put("atlasNetworkProviderCapability", optionalString("atlasNetworkProviderCapability"))
            .put("atlasNetworkProviderHealth", optionalString("atlasNetworkProviderHealth"))
            .put("atlasDeviceContextProviderCapability", optionalString("atlasDeviceContextProviderCapability"))
            .put("atlasDeviceContextProviderHealth", optionalString("atlasDeviceContextProviderHealth"))
    }
}
