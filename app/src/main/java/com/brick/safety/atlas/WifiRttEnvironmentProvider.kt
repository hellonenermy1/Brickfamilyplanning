package com.brick.safety.atlas

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.wifi.ScanResult
import android.net.wifi.WifiManager
import android.net.wifi.rtt.RangingRequest
import android.net.wifi.rtt.RangingResult
import android.net.wifi.rtt.RangingResultCallback
import android.net.wifi.rtt.WifiRttManager
import android.os.Build
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.brick.safety.evidence.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class WifiRttEnvironmentProvider(
    context: Context,
    private val onAtlasScan: (AtlasScan) -> Unit
) : EvidenceProvider {
    companion object {
        private const val MAX_SCAN_AGE_MS = 120_000L
        private const val MAX_APS = 6
    }

    private val appContext = context.applicationContext
    private val wifi = appContext.getSystemService(WifiManager::class.java)
    private val locationManager = appContext.getSystemService(LocationManager::class.java)
    private val rtt = appContext.getSystemService(Context.WIFI_RTT_RANGING_SERVICE) as? WifiRttManager
    private val executor = Executors.newSingleThreadExecutor()
    private val inFlight = AtomicBoolean(false)
    @Volatile private var sink: EvidenceSink? = null
    @Volatile private var decision = EvidenceSamplingDecision(false, null)
    @Volatile private var lastCollectElapsedMs = 0L
    @Volatile private var latestStatus = EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "not_started")

    override val descriptor = EvidenceProviderDescriptor(
        EvidenceProviderId.WIFI_RTT,
        EvidenceFamily.RANGE,
        EvidenceSamplingClass.RADIO_BURST,
        // RTT and Wi-Fi RSSI describe the same RF environment. Keep them correlated deliberately.
        "wifi.scan"
    )

    override fun status(): EvidenceProviderStatus = capabilityStatus().let { gate ->
        if (gate.capability != ProviderCapability.SUPPORTED) gate
        else latestStatus.takeIf { it.capability == ProviderCapability.SUPPORTED } ?: gate
    }

    override fun start(sink: EvidenceSink) {
        this.sink = sink
        latestStatus = capabilityStatus()
    }

    override fun applySampling(decision: EvidenceSamplingDecision) {
        this.decision = decision
    }

    @SuppressLint("MissingPermission", "HardwareIds", "Deprecation")
    override fun collectNow() {
        val gate = capabilityStatus()
        if (!decision.enabled || gate.capability != ProviderCapability.SUPPORTED) {
            latestStatus = gate
            return
        }
        if (inFlight.get()) return
        val nowElapsed = SystemClock.elapsedRealtime()
        decision.intervalMs?.let { interval ->
            if (lastCollectElapsedMs > 0L && nowElapsed >= lastCollectElapsedMs && nowElapsed - lastCollectElapsedMs < interval) return
        }
        val manager = rtt ?: return
        val responders = runCatching { wifi.scanResults }.getOrDefault(emptyList())
            .asSequence()
            .filter { result ->
                val resultElapsed = result.timestamp / 1_000L
                val fresh = resultElapsed in 1..nowElapsed && nowElapsed - resultElapsed <= MAX_SCAN_AGE_MS
                fresh && supportsRtt(result)
            }
            .filter { result -> result.BSSID?.matches(Regex("([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}")) == true }
            .sortedByDescending { it.level }
            .take(MAX_APS)
            .toList()
        if (responders.isEmpty()) {
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "no_rtt_responders")
            return
        }

        val byMac = responders.associate { result ->
            result.BSSID.lowercase() to AtlasPrivacyId.reduce("rtt", result.BSSID.lowercase())
        }
        val request = runCatching { RangingRequest.Builder().addAccessPoints(responders).build() }.getOrElse {
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "request_build_failed")
            return
        }
        if (!inFlight.compareAndSet(false, true)) return
        lastCollectElapsedMs = nowElapsed

        runCatching {
            manager.startRanging(request, executor, object : RangingResultCallback() {
                override fun onRangingFailure(code: Int) {
                    inFlight.set(false)
                    latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "ranging_failure_$code")
                }

                override fun onRangingResults(results: MutableList<RangingResult>) {
                    try { process(results, byMac) }
                    finally { inFlight.set(false) }
                }
            })
        }.onFailure {
            inFlight.set(false)
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "ranging_start_failed")
        }
    }

    override fun stop() {
        sink = null
        executor.shutdownNow()
    }

    private data class RangeObservation(
        val id: String,
        val distanceM: Float,
        val stdDevM: Float?,
        val successfulMeasurements: Int,
        val quality: Float
    )

    private fun process(results: List<RangingResult>, byMac: Map<String, String>) {
        val values = results.mapNotNull { result ->
            if (result.status != RangingResult.STATUS_SUCCESS) return@mapNotNull null
            val rawMac = runCatching { result.macAddress?.toString()?.lowercase() }.getOrNull() ?: return@mapNotNull null
            val id = byMac[rawMac] ?: return@mapNotNull null
            val distanceM = result.distanceMm / 1_000f
            if (!distanceM.isFinite() || distanceM !in -1f..100f) return@mapNotNull null
            val successes = result.numSuccessfulMeasurements.coerceAtLeast(0)
            val stdDevM = if (successes >= 2) {
                runCatching { result.distanceStdDevMm / 1_000f }.getOrNull()?.takeIf { it.isFinite() && it >= 0f && it <= 50f }
            } else null
            val precision = when (stdDevM) {
                null -> 0.45f
                in 0f..0.5f -> 0.95f
                in 0.5f..1.5f -> 0.80f
                in 1.5f..3f -> 0.60f
                else -> 0.35f
            }
            val repeat = (successes / 6f).coerceIn(0.25f, 1f)
            RangeObservation(id, distanceM, stdDevM, successes, (precision * 0.70f + repeat * 0.30f).coerceIn(0.20f, 0.95f))
        }.take(MAX_APS)

        if (values.isEmpty()) {
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "no_successful_ranges")
            return
        }
        val nowElapsed = SystemClock.elapsedRealtime()
        val nowWall = System.currentTimeMillis()
        val scanQuality = values.map { it.quality }.average().toFloat().coerceIn(0.2f, 0.95f)
        val observations = values.map { value ->
            AtlasSignalObservation(
                AtlasSignalKind.WIFI_AP,
                value.id,
                "wifi.scan",
                value.distanceM,
                value.quality,
                sourceHealthy = true
            )
        }
        onAtlasScan(AtlasScan(nowElapsed, nowWall, scanQuality, observations))

        val payload = JSONObject()
            .put("v", 1)
            .put("ranges", JSONArray().also { array ->
                values.forEach { value ->
                    array.put(JSONObject()
                        .put("id", value.id)
                        .put("d", value.distanceM.toDouble())
                        .put("sd", value.stdDevM?.toDouble() ?: JSONObject.NULL)
                        .put("n", value.successfulMeasurements))
                }
            })
            .toString().toByteArray(Charsets.UTF_8)
        if (payload.size <= EvidenceProtocol.MAX_RECORD_PAYLOAD_BYTES) {
            sink?.emit(EvidenceObservation(
                elapsedRealtimeMs = nowElapsed,
                wallTimeMs = nowWall,
                provider = EvidenceProviderId.WIFI_RTT,
                family = EvidenceFamily.RANGE,
                independenceGroup = "wifi.scan",
                capability = ProviderCapability.SUPPORTED,
                health = ProviderHealth.HEALTHY,
                quality = when {
                    scanQuality >= 0.75f -> EvidenceQuality.HIGH
                    scanQuality >= 0.45f -> EvidenceQuality.MEDIUM
                    else -> EvidenceQuality.LOW
                },
                payload = payload
            ))
        }
        latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }

    private fun capabilityStatus(): EvidenceProviderStatus {
        if (!appContext.packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI_RTT) || rtt == null) {
            return EvidenceProviderStatus(ProviderCapability.UNSUPPORTED, ProviderHealth.UNAVAILABLE, "no_wifi_rtt")
        }
        if (ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return EvidenceProviderStatus(ProviderCapability.PERMISSION_REQUIRED, ProviderHealth.UNAVAILABLE, "fine_location_permission")
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(appContext, Manifest.permission.NEARBY_WIFI_DEVICES) != PackageManager.PERMISSION_GRANTED) {
            return EvidenceProviderStatus(ProviderCapability.PERMISSION_REQUIRED, ProviderHealth.UNAVAILABLE, "nearby_wifi_permission")
        }
        if (!runCatching { locationManager.isLocationEnabled }.getOrDefault(false)) {
            return EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "location_services_off")
        }
        if (!runCatching { rtt.isAvailable }.getOrDefault(false)) {
            return EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "rtt_unavailable")
        }
        return EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }

    @Suppress("DEPRECATION")
    private fun supportsRtt(result: ScanResult): Boolean {
        if (result.is80211mcResponder) return true
        return Build.VERSION.SDK_INT >= 35 && runCatching { result.is80211azNtbResponder }.getOrDefault(false)
    }
}
