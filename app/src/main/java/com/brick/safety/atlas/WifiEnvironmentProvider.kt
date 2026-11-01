package com.brick.safety.atlas

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.wifi.ScanResult
import android.net.wifi.WifiManager
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.brick.safety.evidence.*
import org.json.JSONArray
import org.json.JSONObject

class WifiEnvironmentProvider(
    context: Context,
    private val onAtlasScan: (AtlasScan) -> Unit
) : EvidenceProvider {
    companion object {
        private const val MAX_ATLAS_APS = 32
        private const val MAX_EVIDENCE_APS = 12
        private const val MAX_SCAN_AGE_MS = 120_000L
        private val COMMON_SSIDS = setOf(
            "wireless@sgx",
            "wireless@sg",
            "guest@swn",
            "free wifi"
        )
    }

    private val appContext = context.applicationContext
    private val wifi = appContext.getSystemService(WifiManager::class.java)
    private val locationManager = appContext.getSystemService(LocationManager::class.java)
    @Volatile private var sink: EvidenceSink? = null
    @Volatile private var decision = EvidenceSamplingDecision(false, null)
    @Volatile private var lastCollectElapsedMs = 0L
    @Volatile private var latestStatus = EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "not_started")

    override val descriptor = EvidenceProviderDescriptor(
        EvidenceProviderId.WIFI_ENVIRONMENT,
        EvidenceFamily.WIFI,
        EvidenceSamplingClass.RADIO_BURST,
        "wifi.scan"
    )

    override fun status(): EvidenceProviderStatus = capabilityStatus().let { current ->
        if (current.capability != ProviderCapability.SUPPORTED) current
        else latestStatus.takeIf { it.capability == ProviderCapability.SUPPORTED } ?: current
    }

    override fun start(sink: EvidenceSink) {
        this.sink = sink
        latestStatus = capabilityStatus()
    }

    override fun applySampling(decision: EvidenceSamplingDecision) {
        this.decision = decision
    }

    @SuppressLint("MissingPermission")
    override fun collectNow() {
        val gate = capabilityStatus()
        if (!decision.enabled || gate.capability != ProviderCapability.SUPPORTED) {
            latestStatus = gate
            return
        }
        val now = SystemClock.elapsedRealtime()
        val interval = decision.intervalMs
        if (interval != null && lastCollectElapsedMs > 0L && now >= lastCollectElapsedMs && now - lastCollectElapsedMs < interval) return
        lastCollectElapsedMs = now

        // Read only a fresh system cache at the scheduled Brick pulse, then request the next scan.
        // Android may throttle startScan(); throttling is a degraded provider state, never a retry loop.
        consumeCurrentResults()
        val accepted = runCatching { wifi.startScan() }.getOrDefault(false)
        latestStatus = if (accepted) {
            EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
        } else {
            EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "scan_throttled_or_rejected")
        }
    }

    override fun stop() {
        sink = null
    }

    @SuppressLint("MissingPermission", "HardwareIds", "Deprecation")
    private fun consumeCurrentResults() {
        if (capabilityStatus().capability != ProviderCapability.SUPPORTED) return
        val nowElapsed = SystemClock.elapsedRealtime()
        val nowWall = System.currentTimeMillis()
        val fresh = runCatching { wifi.scanResults }.getOrDefault(emptyList())
            .asSequence()
            .mapNotNull { result -> normalized(result, nowElapsed) }
            .sortedByDescending { it.rssi }
            .distinctBy { it.apId }
            .take(MAX_ATLAS_APS)
            .toList()
        if (fresh.isEmpty()) return

        val observations = ArrayList<AtlasSignalObservation>(fresh.size * 2)
        for (ap in fresh) {
            observations += AtlasSignalObservation(
                AtlasSignalKind.WIFI_AP,
                ap.apId,
                "wifi.scan",
                ap.rssi.toFloat(),
                ap.quality,
                sourceHealthy = true
            )
            ap.ssidId?.let { ssid ->
                observations += AtlasSignalObservation(
                    AtlasSignalKind.WIFI_SSID_HINT,
                    ssid,
                    "wifi.scan",
                    null,
                    (ap.quality * 0.55f).coerceIn(0f, 1f),
                    semanticCommon = ap.semanticCommon,
                    sourceHealthy = true
                )
            }
        }
        val scanQuality = (0.35f + fresh.size.coerceAtMost(12) / 20f).coerceAtMost(0.95f)
        val atlasScan = AtlasScan(nowElapsed, nowWall, scanQuality, observations.take(128))
        onAtlasScan(atlasScan)
        emitEvidence(fresh, nowElapsed, nowWall, scanQuality)
        latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }

    private data class NormalizedAp(
        val apId: String,
        val ssidId: String?,
        val semanticCommon: Boolean,
        val rssi: Int,
        val frequency: Int,
        val channelWidth: Int,
        val securityClass: String,
        val quality: Float
    )

    @SuppressLint("HardwareIds", "Deprecation")
    private fun normalized(result: ScanResult, nowElapsed: Long): NormalizedAp? {
        val bssid = result.BSSID?.lowercase()?.takeIf { it.matches(Regex("([0-9a-f]{2}:){5}[0-9a-f]{2}")) } ?: return null
        val resultElapsed = result.timestamp / 1_000L
        if (resultElapsed <= 0L || resultElapsed > nowElapsed) return null
        val age = nowElapsed - resultElapsed
        if (age > MAX_SCAN_AGE_MS) return null
        val rssi = result.level.coerceIn(-127, 0)
        if (rssi < -100) return null
        val ssidRaw = result.SSID?.trim()?.takeIf { it.isNotEmpty() && it != WifiManager.UNKNOWN_SSID }
        val normalizedSsid = ssidRaw?.lowercase()?.replace(Regex("\\s+"), " ")?.take(64)
        val freshness = (1f - age.toFloat() / MAX_SCAN_AGE_MS).coerceIn(0.15f, 1f)
        val signalQuality = ((rssi + 100) / 55f).coerceIn(0.15f, 1f)
        val security = securityClass(result.capabilities)
        return NormalizedAp(
            AtlasPrivacyId.reduce("wifi", bssid),
            normalizedSsid?.let { AtlasPrivacyId.reduce("ssid", it) },
            normalizedSsid != null && normalizedSsid in COMMON_SSIDS,
            rssi,
            result.frequency.coerceAtLeast(0),
            result.channelWidth.coerceAtLeast(0),
            security,
            (freshness * 0.55f + signalQuality * 0.45f).coerceIn(0.1f, 1f)
        )
    }

    private fun securityClass(capabilities: String?): String {
        val c = capabilities.orEmpty().uppercase()
        return when {
            "SAE" in c -> "sae"
            "OWE" in c -> "owe"
            "WPA3" in c -> "wpa3"
            "WPA2" in c || "RSN" in c -> "wpa2"
            "WPA" in c -> "wpa"
            "WEP" in c -> "wep"
            c.isBlank() -> "open"
            else -> "other"
        }
    }

    private fun emitEvidence(results: List<NormalizedAp>, elapsed: Long, wall: Long, quality: Float) {
        val payload = JSONObject()
            .put("v", 1)
            .put("q", quality.toDouble())
            .put("aps", JSONArray().also { array ->
                results.take(MAX_EVIDENCE_APS).forEach { ap ->
                    array.put(JSONObject()
                        .put("id", ap.apId)
                        .put("s", ap.ssidId ?: JSONObject.NULL)
                        .put("c", ap.semanticCommon)
                        .put("r", ap.rssi)
                        .put("f", ap.frequency)
                        .put("w", ap.channelWidth)
                        .put("sec", ap.securityClass))
                }
            })
            .toString().toByteArray(Charsets.UTF_8)
        if (payload.size > EvidenceProtocol.MAX_RECORD_PAYLOAD_BYTES) return
        sink?.emit(EvidenceObservation(
            elapsedRealtimeMs = elapsed,
            wallTimeMs = wall,
            provider = EvidenceProviderId.WIFI_ENVIRONMENT,
            family = EvidenceFamily.WIFI,
            independenceGroup = "wifi.scan",
            capability = ProviderCapability.SUPPORTED,
            health = latestStatus.health.takeIf { latestStatus.capability == ProviderCapability.SUPPORTED } ?: ProviderHealth.HEALTHY,
            quality = when {
                quality >= 0.75f -> EvidenceQuality.HIGH
                quality >= 0.45f -> EvidenceQuality.MEDIUM
                else -> EvidenceQuality.LOW
            },
            payload = payload
        ))
    }

    private fun capabilityStatus(): EvidenceProviderStatus {
        if (ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return EvidenceProviderStatus(ProviderCapability.PERMISSION_REQUIRED, ProviderHealth.UNAVAILABLE, "fine_location_permission")
        }
        val locationEnabled = runCatching { locationManager.isLocationEnabled }.getOrDefault(false)
        if (!locationEnabled) return EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "location_services_off")
        if (!runCatching { wifi.isWifiEnabled }.getOrDefault(false)) {
            return EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "wifi_off")
        }
        return EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }
}
