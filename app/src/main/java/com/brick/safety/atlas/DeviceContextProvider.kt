package com.brick.safety.atlas

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.SystemClock
import com.brick.safety.evidence.*
import org.json.JSONArray
import org.json.JSONObject

/**
 * Weak device context only. Charging patterns and explicitly authorised companion-device presence
 * can support a learned environment, but never anchor a place by themselves. They intentionally
 * share one independence group so a watch + charger cannot masquerade as two independent sensors.
 */
class DeviceContextProvider(
    context: Context,
    private val onAtlasScan: (AtlasScan) -> Unit
) : EvidenceProvider {
    private val appContext = context.applicationContext
    private val companionPresence = CompanionPresenceController(appContext)
    @Volatile private var sink: EvidenceSink? = null
    @Volatile private var decision = EvidenceSamplingDecision(false, null)
    @Volatile private var lastCollectElapsedMs = 0L
    @Volatile private var latestCompanionDetail = "not_started"

    override val descriptor = EvidenceProviderDescriptor(
        EvidenceProviderId.COMPANION,
        EvidenceFamily.COMPANION,
        EvidenceSamplingClass.NETWORK_CONTEXT,
        "device.context"
    )

    override fun status() = EvidenceProviderStatus(
        ProviderCapability.SUPPORTED,
        ProviderHealth.HEALTHY,
        latestCompanionDetail
    )

    override fun start(sink: EvidenceSink) {
        this.sink = sink
        latestCompanionDetail = companionPresence.snapshotAndEnsureObserving().capabilityDetail
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

        val companion = companionPresence.snapshotAndEnsureObserving()
        latestCompanionDetail = companion.capabilityDetail

        // Battery is a sticky system broadcast, but a missing response must not suppress companion
        // evidence or make the provider fail.
        val battery = runCatching {
            appContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        }.getOrNull()
        val plugged = battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
        val plugKind = when (plugged) {
            BatteryManager.BATTERY_PLUGGED_AC -> "ac"
            BatteryManager.BATTERY_PLUGGED_USB -> "usb"
            BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
            BatteryManager.BATTERY_PLUGGED_DOCK -> "dock"
            0 -> "none"
            else -> "unknown"
        }
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val pct = if (level >= 0 && scale > 0) ((level * 100.0 / scale).toInt()).coerceIn(0, 100) else null
        val batteryStatus = battery?.getIntExtra(BatteryManager.EXTRA_STATUS, BatteryManager.BATTERY_STATUS_UNKNOWN)
            ?: BatteryManager.BATTERY_STATUS_UNKNOWN
        val charging = battery != null && (
            batteryStatus == BatteryManager.BATTERY_STATUS_CHARGING ||
                batteryStatus == BatteryManager.BATTERY_STATUS_FULL ||
                plugKind !in setOf("none", "unknown")
            )
        val nowWall = System.currentTimeMillis()

        val observations = ArrayList<AtlasSignalObservation>(1 + companion.presentSignalIds.size)
        if (battery != null) {
            observations += AtlasSignalObservation(
                AtlasSignalKind.CHARGING,
                "charge:$plugKind",
                "device.context",
                pct?.toFloat(),
                0.22f,
                sourceHealthy = true
            )
        }
        companion.presentSignalIds.take(8).forEach { reducedId ->
            observations += AtlasSignalObservation(
                AtlasSignalKind.COMPANION,
                reducedId,
                "device.context",
                null,
                0.30f,
                sourceHealthy = true
            )
        }

        if (observations.isNotEmpty()) {
            onAtlasScan(AtlasScan(
                nowElapsed,
                nowWall,
                if (companion.presentSignalIds.isNotEmpty()) 0.30f else 0.22f,
                observations
            ))
        }

        if (battery == null && companion.associatedCount == 0) return
        val companionIds = JSONArray().also { array ->
            companion.presentSignalIds.take(8).forEach(array::put)
        }
        val payload = JSONObject()
            .put("v", 2)
            .put("charging", charging)
            .put("plug", plugKind)
            .put("pct", pct ?: JSONObject.NULL)
            .put("associatedCompanions", companion.associatedCount.coerceIn(0, 64))
            .put("presentCompanions", companionIds)
            .put("presenceState", companion.capabilityDetail)
            .toString().toByteArray(Charsets.UTF_8)
        if (payload.size <= EvidenceProtocol.MAX_RECORD_PAYLOAD_BYTES) {
            sink?.emit(EvidenceObservation(
                elapsedRealtimeMs = nowElapsed,
                wallTimeMs = nowWall,
                provider = EvidenceProviderId.COMPANION,
                family = EvidenceFamily.COMPANION,
                independenceGroup = "device.context",
                capability = ProviderCapability.SUPPORTED,
                health = ProviderHealth.HEALTHY,
                quality = EvidenceQuality.LOW,
                payload = payload
            ))
        }
    }

    override fun stop() {
        sink = null
    }
}
