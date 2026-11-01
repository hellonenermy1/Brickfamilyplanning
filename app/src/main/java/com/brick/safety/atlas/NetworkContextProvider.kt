package com.brick.safety.atlas

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.SystemClock
import com.brick.safety.evidence.*
import org.json.JSONArray
import org.json.JSONObject

class NetworkContextProvider(
    context: Context,
    private val onAtlasScan: (AtlasScan) -> Unit
) : EvidenceProvider {
    private val appContext = context.applicationContext
    private val connectivity = appContext.getSystemService(ConnectivityManager::class.java)
    @Volatile private var sink: EvidenceSink? = null
    @Volatile private var decision = EvidenceSamplingDecision(false, null)
    @Volatile private var lastCollectElapsedMs = 0L
    @Volatile private var latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)

    override val descriptor = EvidenceProviderDescriptor(
        EvidenceProviderId.NETWORK_CONTEXT,
        EvidenceFamily.NETWORK,
        EvidenceSamplingClass.NETWORK_CONTEXT,
        "network.ctx"
    )

    override fun status(): EvidenceProviderStatus = latestStatus

    override fun start(sink: EvidenceSink) {
        this.sink = sink
        latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }

    override fun applySampling(decision: EvidenceSamplingDecision) {
        this.decision = decision
    }

    override fun collectNow() {
        if (!decision.enabled) return
        val nowElapsed = SystemClock.elapsedRealtime()
        decision.intervalMs?.let { interval ->
            if (lastCollectElapsedMs > 0L && nowElapsed >= lastCollectElapsedMs && nowElapsed - lastCollectElapsedMs < interval) return
        }
        lastCollectElapsedMs = nowElapsed
        val network = connectivity.activeNetwork
        if (network == null) {
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "offline")
            return
        }
        val caps = connectivity.getNetworkCapabilities(network)
        val links = connectivity.getLinkProperties(network)
        if (caps == null || links == null) {
            latestStatus = EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.DEGRADED, "network_state_unavailable")
            return
        }

        val transport = when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "vpn"
            else -> "other"
        }
        val validated = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        val captive = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_CAPTIVE_PORTAL)
        val metered = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        val hasV4 = links.linkAddresses.any { it.address.address.size == 4 }
        val hasV6 = links.linkAddresses.any { it.address.address.size == 16 }
        val dnsIds = links.dnsServers.take(4).mapNotNull { server ->
            runCatching { AtlasPrivacyId.reduce("dns", server.hostAddress.orEmpty()) }.getOrNull()
        }.sorted()
        val rawFingerprint = buildString {
            append(transport).append('|').append(if (validated) '1' else '0').append('|')
            append(if (captive) '1' else '0').append('|').append(if (metered) '1' else '0').append('|')
            append(if (hasV4) '1' else '0').append(if (hasV6) '1' else '0').append('|')
            append(dnsIds.joinToString(","))
        }
        val signalId = AtlasPrivacyId.reduce("net", rawFingerprint)
        val quality = when {
            validated && dnsIds.isNotEmpty() -> 0.65f
            validated -> 0.50f
            captive -> 0.25f
            else -> 0.35f
        }
        val nowWall = System.currentTimeMillis()
        val observation = AtlasSignalObservation(
            AtlasSignalKind.NETWORK_CONTEXT,
            signalId,
            "network.ctx",
            null,
            quality,
            sourceHealthy = true
        )
        onAtlasScan(AtlasScan(nowElapsed, nowWall, quality, listOf(observation)))

        val payload = JSONObject()
            .put("v", 1)
            .put("id", signalId)
            .put("t", transport)
            .put("validated", validated)
            .put("captive", captive)
            .put("metered", metered)
            .put("v4", hasV4)
            .put("v6", hasV6)
            .put("dns", JSONArray(dnsIds))
            .toString().toByteArray(Charsets.UTF_8)
        if (payload.size <= EvidenceProtocol.MAX_RECORD_PAYLOAD_BYTES) {
            sink?.emit(EvidenceObservation(
                elapsedRealtimeMs = nowElapsed,
                wallTimeMs = nowWall,
                provider = EvidenceProviderId.NETWORK_CONTEXT,
                family = EvidenceFamily.NETWORK,
                independenceGroup = "network.ctx",
                capability = ProviderCapability.SUPPORTED,
                health = ProviderHealth.HEALTHY,
                quality = if (quality >= 0.55f) EvidenceQuality.MEDIUM else EvidenceQuality.LOW,
                payload = payload
            ))
        }
        latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }

    override fun stop() {
        sink = null
    }
}
