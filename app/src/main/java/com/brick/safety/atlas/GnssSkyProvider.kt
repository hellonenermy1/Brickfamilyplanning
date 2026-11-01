package com.brick.safety.atlas

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.GnssStatus
import android.location.LocationManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.brick.safety.evidence.*
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.roundToInt
import kotlin.math.sqrt

class GnssSkyProvider(
    context: Context,
    private val onAtlasScan: (AtlasScan) -> Unit
) : EvidenceProvider {
    private data class SkySnapshot(
        val elapsedMs: Long,
        val signalId: String,
        val total: Int,
        val used: Int,
        val averageCn0: Float?,
        val cn0StdDev: Float?,
        val cn0Bands: List<Int>,
        val constellationCounts: List<Int>,
        val azimuthSectors: List<Int>,
        val elevationBands: List<Int>,
        val carrierBands: List<Int>,
        val skyState: String,
        val quality: Float
    )

    private val appContext = context.applicationContext
    private val locationManager = appContext.getSystemService(LocationManager::class.java)
    @Volatile private var sink: EvidenceSink? = null
    @Volatile private var decision = EvidenceSamplingDecision(false, null)
    @Volatile private var lastCollectElapsedMs = 0L
    @Volatile private var lastConsumedSnapshotElapsedMs = 0L
    @Volatile private var latest: SkySnapshot? = null
    @Volatile private var registered = false
    @Volatile private var latestStatus = EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "not_started")

    override val descriptor = EvidenceProviderDescriptor(
        EvidenceProviderId.GNSS_QUALITY,
        EvidenceFamily.POSITION,
        EvidenceSamplingClass.CONTINUOUS_SENSOR,
        "gnss.sky"
    )

    private val callback = object : GnssStatus.Callback() {
        override fun onStarted() {
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
        }

        override fun onStopped() {
            latestStatus = EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "gnss_stopped")
        }

        override fun onSatelliteStatusChanged(status: GnssStatus) {
            latest = buildSnapshot(status)
        }
    }

    override fun status(): EvidenceProviderStatus = capabilityStatus().let { gate ->
        if (gate.capability != ProviderCapability.SUPPORTED) gate
        else latestStatus.takeIf { it.capability == ProviderCapability.SUPPORTED } ?: gate
    }

    @SuppressLint("MissingPermission")
    override fun start(sink: EvidenceSink) {
        this.sink = sink
        val gate = capabilityStatus()
        latestStatus = gate
        if (gate.capability != ProviderCapability.SUPPORTED || registered) return
        registered = runCatching {
            locationManager.registerGnssStatusCallback(callback, Handler(Looper.getMainLooper()))
        }.getOrDefault(false)
        if (!registered) latestStatus = EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.DEGRADED, "gnss_callback_registration_failed")
    }

    override fun applySampling(decision: EvidenceSamplingDecision) {
        this.decision = decision
    }

    override fun collectNow() {
        if (!decision.enabled) return
        val gate = capabilityStatus()
        if (gate.capability != ProviderCapability.SUPPORTED) {
            latestStatus = gate
            return
        }
        val nowElapsed = SystemClock.elapsedRealtime()
        decision.intervalMs?.let { interval ->
            if (lastCollectElapsedMs > 0L && nowElapsed >= lastCollectElapsedMs && nowElapsed - lastCollectElapsedMs < interval) return
        }
        val sky = latest ?: run {
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "no_gnss_status")
            return
        }
        val age = nowElapsed - sky.elapsedMs
        if (age !in 0L..30_000L) {
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "stale_gnss_status")
            return
        }
        // The foreground pulse can run faster than GnssStatus callbacks. Re-emitting the same sky
        // object would fabricate repeatability and make Atlas trust grow without a new measurement.
        if (sky.elapsedMs <= lastConsumedSnapshotElapsedMs) return
        lastConsumedSnapshotElapsedMs = sky.elapsedMs
        lastCollectElapsedMs = nowElapsed
        val nowWall = System.currentTimeMillis()
        val observations = listOf(
            AtlasSignalObservation(
                AtlasSignalKind.GNSS_SKY,
                sky.signalId,
                "gnss.sky",
                sky.averageCn0,
                sky.quality,
                sourceHealthy = true
            ),
            AtlasSignalObservation(
                AtlasSignalKind.GNSS_SKY,
                AtlasPrivacyId.reduce("gnssstate", sky.skyState),
                "gnss.sky",
                sky.cn0StdDev,
                (sky.quality * 0.55f).coerceIn(0.10f, 0.50f),
                sourceHealthy = true
            )
        )
        onAtlasScan(AtlasScan(nowElapsed, nowWall, sky.quality, observations))
        val payload = JSONObject()
            .put("v", 1)
            .put("id", sky.signalId)
            .put("total", sky.total)
            .put("used", sky.used)
            .put("cn0", sky.averageCn0 ?: JSONObject.NULL)
            .put("cn0sd", sky.cn0StdDev ?: JSONObject.NULL)
            .put("cn0b", JSONArray(sky.cn0Bands))
            .put("const", JSONArray(sky.constellationCounts))
            .put("az", JSONArray(sky.azimuthSectors))
            .put("el", JSONArray(sky.elevationBands))
            .put("cf", JSONArray(sky.carrierBands))
            .put("sky", sky.skyState)
            .toString().toByteArray(Charsets.UTF_8)
        if (payload.size <= EvidenceProtocol.MAX_RECORD_PAYLOAD_BYTES) {
            sink?.emit(EvidenceObservation(
                elapsedRealtimeMs = nowElapsed,
                wallTimeMs = nowWall,
                provider = EvidenceProviderId.GNSS_QUALITY,
                family = EvidenceFamily.POSITION,
                independenceGroup = "gnss.sky",
                capability = ProviderCapability.SUPPORTED,
                health = ProviderHealth.HEALTHY,
                quality = when {
                    sky.quality >= 0.70f -> EvidenceQuality.HIGH
                    sky.quality >= 0.40f -> EvidenceQuality.MEDIUM
                    else -> EvidenceQuality.LOW
                },
                payload = payload
            ))
        }
        latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }

    override fun stop() {
        if (registered) runCatching { locationManager.unregisterGnssStatusCallback(callback) }
        registered = false
        sink = null
    }

    private fun buildSnapshot(status: GnssStatus): SkySnapshot {
        val constellations = IntArray(8)
        val azimuth = IntArray(8)
        val elevation = IntArray(4)
        val carriers = IntArray(4)
        val cn0Bands = IntArray(5)
        var used = 0
        var cn0Sum = 0f
        var cn0SquareSum = 0.0
        var cn0Count = 0

        for (i in 0 until status.satelliteCount.coerceAtMost(96)) {
            val cn0 = status.getCn0DbHz(i).takeIf { it.isFinite() && it >= 0f }
            if (status.usedInFix(i)) used += 1
            cn0?.let {
                cn0Sum += it
                cn0SquareSum += it.toDouble() * it
                cn0Count += 1
                val band = when {
                    it < 15f -> 0
                    it < 25f -> 1
                    it < 35f -> 2
                    it < 45f -> 3
                    else -> 4
                }
                cn0Bands[band] += 1
            }

            val constellation = status.getConstellationType(i)
            val cIndex = when (constellation) {
                GnssStatus.CONSTELLATION_GPS -> 0
                GnssStatus.CONSTELLATION_GLONASS -> 1
                GnssStatus.CONSTELLATION_GALILEO -> 2
                GnssStatus.CONSTELLATION_BEIDOU -> 3
                GnssStatus.CONSTELLATION_QZSS -> 4
                GnssStatus.CONSTELLATION_SBAS -> 5
                GnssStatus.CONSTELLATION_IRNSS -> 6
                else -> 7
            }
            constellations[cIndex] += 1

            val az = status.getAzimuthDegrees(i)
            if (az.isFinite()) azimuth[((az.coerceIn(0f, 359.999f) / 45f).toInt()).coerceIn(0, 7)] += 1
            val el = status.getElevationDegrees(i)
            if (el.isFinite()) {
                val eIndex = when {
                    el < 15f -> 0
                    el < 30f -> 1
                    el < 60f -> 2
                    else -> 3
                }
                elevation[eIndex] += 1
            }
            if (status.hasCarrierFrequencyHz(i)) {
                val hz = status.getCarrierFrequencyHz(i)
                val band = when {
                    hz < 1.2e9f -> 0
                    hz < 1.4e9f -> 1
                    hz < 1.7e9f -> 2
                    else -> 3
                }
                carriers[band] += 1
            }
        }
        val avg = if (cn0Count > 0) cn0Sum / cn0Count else null
        val variance = if (cn0Count >= 2) {
            (cn0SquareSum / cn0Count - (avg!!.toDouble() * avg)).coerceAtLeast(0.0)
        } else null
        val stdDev = variance?.let { sqrt(it).toFloat() }
        val total = status.satelliteCount.coerceIn(0, 96)
        val skyState = skyState(total, used, avg, stdDev, elevation, azimuth)
        val fingerprint = buildString {
            append("c=").append(constellations.joinToString(",") { bucket(it).toString() })
            append("|a=").append(azimuth.joinToString(",") { bucket(it).toString() })
            append("|e=").append(elevation.joinToString(",") { bucket(it).toString() })
            append("|f=").append(carriers.joinToString(",") { bucket(it).toString() })
            append("|b=").append(cn0Bands.joinToString(",") { bucket(it).toString() })
            append("|u=").append(bucket(used))
            append("|n=").append(bucket(total))
            append("|q=").append(((avg ?: 0f) / 5f).roundToInt().coerceIn(0, 12))
            append("|s=").append(skyState)
        }
        val quality = ((used.coerceAtMost(8) / 10f) + (total.coerceAtMost(20) / 40f) + ((avg ?: 0f) / 100f)).coerceIn(0.15f, 0.90f)
        return SkySnapshot(
            SystemClock.elapsedRealtime(),
            AtlasPrivacyId.reduce("gnss", fingerprint),
            total,
            used,
            avg,
            stdDev,
            cn0Bands.toList(),
            constellations.toList(),
            azimuth.toList(),
            elevation.toList(),
            carriers.toList(),
            skyState,
            quality
        )
    }

    private fun skyState(
        total: Int,
        used: Int,
        avgCn0: Float?,
        stdDevCn0: Float?,
        elevation: IntArray,
        azimuth: IntArray
    ): String {
        val avg = avgCn0 ?: 0f
        val highElevation = elevation.getOrElse(3) { 0 }
        val occupiedSectors = azimuth.count { it > 0 }
        return when {
            total <= 2 || avg < 12f -> "blocked"
            total >= 12 && used >= 6 && avg >= 28f && highElevation >= 2 && occupiedSectors >= 5 -> "open"
            total >= 8 && used <= 2 && avg >= 18f -> "degraded"
            stdDevCn0 != null && stdDevCn0 > 13f && used < total / 2 -> "degraded"
            occupiedSectors <= 3 || highElevation == 0 -> "constrained"
            else -> "mixed"
        }
    }

    private fun capabilityStatus(): EvidenceProviderStatus {
        if (ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return EvidenceProviderStatus(ProviderCapability.PERMISSION_REQUIRED, ProviderHealth.UNAVAILABLE, "fine_location_permission")
        }
        if (!runCatching { locationManager.isLocationEnabled }.getOrDefault(false)) {
            return EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "location_services_off")
        }
        return EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }

    private fun bucket(value: Int): Int = when {
        value <= 0 -> 0
        value <= 2 -> 1
        value <= 4 -> 2
        value <= 8 -> 3
        value <= 16 -> 4
        else -> 5
    }
}
