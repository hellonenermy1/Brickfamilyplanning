package com.brick.safety.atlas

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.brick.safety.evidence.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class LanEnvironmentProvider(
    context: Context,
    private val onAtlasScan: (AtlasScan) -> Unit
) : EvidenceProvider {
    companion object {
        private const val DISCOVERY_WINDOW_MS = 2_000L
        private const val MAX_SERVICES = 24
        private val SERVICE_TYPES = listOf(
            "_googlecast._tcp." to "cast",
            "_airplay._tcp." to "airplay",
            "_ipp._tcp." to "printer",
            "_printer._tcp." to "printer",
            "_matter._tcp." to "matter",
            "_http._tcp." to "http"
        )
    }

    private val appContext = context.applicationContext
    private val nsd = appContext.getSystemService(NsdManager::class.java)
    private val connectivity = appContext.getSystemService(ConnectivityManager::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private val processing = Executors.newSingleThreadExecutor()
    private val discovering = AtomicBoolean(false)
    private val found = linkedMapOf<String, Pair<String, String>>()
    @Volatile private var sink: EvidenceSink? = null
    @Volatile private var decision = EvidenceSamplingDecision(false, null)
    @Volatile private var lastCollectElapsedMs = 0L
    @Volatile private var typeIndex = 0
    @Volatile private var currentListener: NsdManager.DiscoveryListener? = null
    @Volatile private var latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)

    override val descriptor = EvidenceProviderDescriptor(
        EvidenceProviderId.LAN_ENVIRONMENT,
        EvidenceFamily.NETWORK,
        EvidenceSamplingClass.NETWORK_CONTEXT,
        "lan.nsd"
    )

    override fun status(): EvidenceProviderStatus = latestStatus

    override fun start(sink: EvidenceSink) {
        this.sink = sink
    }

    override fun applySampling(decision: EvidenceSamplingDecision) {
        this.decision = decision
    }

    override fun collectNow() {
        if (!decision.enabled || discovering.get()) return
        if (!localNetworkAvailable()) {
            latestStatus = EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "no_local_network")
            return
        }
        val now = SystemClock.elapsedRealtime()
        decision.intervalMs?.let { interval ->
            if (lastCollectElapsedMs > 0L && now >= lastCollectElapsedMs && now - lastCollectElapsedMs < interval) return
        }
        if (!discovering.compareAndSet(false, true)) return
        lastCollectElapsedMs = now
        synchronized(found) { found.clear() }

        val (type, category) = SERVICE_TYPES[typeIndex % SERVICE_TYPES.size]
        typeIndex = (typeIndex + 1) % SERVICE_TYPES.size
        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String) {
                latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
            }

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                val rawName = serviceInfo.serviceName?.trim()?.takeIf { it.isNotEmpty() } ?: return
                val serviceType = serviceInfo.serviceType?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: type.lowercase()
                val id = runCatching { AtlasPrivacyId.reduce("lan", "$serviceType|${rawName.lowercase()}") }.getOrNull() ?: return
                synchronized(found) {
                    if (found.size < MAX_SERVICES) found[id] = id to category
                }
            }

            override fun onServiceLost(serviceInfo: NsdServiceInfo) = Unit
            override fun onDiscoveryStopped(serviceType: String) = Unit

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "discovery_start_$errorCode")
                finishDiscovery(this, stopAgain = false)
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "discovery_stop_$errorCode")
                finishDiscovery(this, stopAgain = false)
            }
        }
        currentListener = listener
        runCatching { nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, listener) }
            .onSuccess { handler.postDelayed({ finishDiscovery(listener) }, DISCOVERY_WINDOW_MS) }
            .onFailure {
                discovering.set(false)
                currentListener = null
                latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "discovery_start_failed")
            }
    }

    override fun stop() {
        handler.removeCallbacksAndMessages(null)
        currentListener?.let { listener -> runCatching { nsd.stopServiceDiscovery(listener) } }
        currentListener = null
        discovering.set(false)
        sink = null
        processing.shutdownNow()
    }

    private fun finishDiscovery(listener: NsdManager.DiscoveryListener, stopAgain: Boolean = true) {
        if (!discovering.compareAndSet(true, false)) return
        handler.removeCallbacksAndMessages(null)
        if (stopAgain) runCatching { nsd.stopServiceDiscovery(listener) }
        currentListener = null
        val snapshot = synchronized(found) { found.values.toList() }
        val nowElapsed = SystemClock.elapsedRealtime()
        val nowWall = System.currentTimeMillis()
        processing.execute { process(snapshot, nowElapsed, nowWall) }
    }

    private fun process(snapshot: List<Pair<String, String>>, elapsed: Long, wall: Long) {
        if (snapshot.isEmpty()) {
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "no_services_seen")
            return
        }
        val observations = snapshot.map { (id, _) ->
            AtlasSignalObservation(
                AtlasSignalKind.LAN_SERVICE,
                id,
                "lan.nsd",
                null,
                0.60f,
                sourceHealthy = true
            )
        }
        val quality = (0.40f + snapshot.size.coerceAtMost(8) / 20f).coerceAtMost(0.75f)
        onAtlasScan(AtlasScan(elapsed, wall, quality, observations))
        val payload = JSONObject()
            .put("v", 1)
            .put("services", JSONArray().also { array ->
                snapshot.take(12).forEach { (id, category) ->
                    array.put(JSONObject().put("id", id).put("cat", category))
                }
            })
            .toString().toByteArray(Charsets.UTF_8)
        if (payload.size <= EvidenceProtocol.MAX_RECORD_PAYLOAD_BYTES) {
            sink?.emit(EvidenceObservation(
                elapsedRealtimeMs = elapsed,
                wallTimeMs = wall,
                provider = EvidenceProviderId.LAN_ENVIRONMENT,
                family = EvidenceFamily.NETWORK,
                independenceGroup = "lan.nsd",
                capability = ProviderCapability.SUPPORTED,
                health = ProviderHealth.HEALTHY,
                quality = EvidenceQuality.MEDIUM,
                payload = payload
            ))
        }
        latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }

    private fun localNetworkAvailable(): Boolean {
        val network = connectivity.activeNetwork ?: return false
        val caps = connectivity.getNetworkCapabilities(network) ?: return false
        // A local-only Wi-Fi/Ethernet network can still expose stable NSD services even when it has
        // no Internet validation. Do not incorrectly suppress LAN evidence in that state.
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }
}
