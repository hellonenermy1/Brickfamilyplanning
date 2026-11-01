package com.brick.safety.atlas

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.SystemClock
import com.brick.safety.evidence.*
import org.json.JSONObject

/**
 * Weak device context only. Charging can help distinguish repeated routines, but can never anchor a
 * place by itself and is intentionally assigned to the low-trust COMPANION/context family.
 */
class DeviceContextProvider(
    context: Context,
    private val onAtlasScan: (AtlasScan) -> Unit
) : EvidenceProvider {
    private val appContext = context.applicationContext
    @Volatile private var sink: EvidenceSink? = null
    @Volatile private var decision = EvidenceSamplingDecision(false, null)
    @Volatile private var lastCollectElapsedMs = 0L

    override val descriptor = EvidenceProviderDescriptor(
        EvidenceProviderId.COMPANION,
        EvidenceFamily.COMPANION,
        EvidenceSamplingClass.NETWORK_CONTEXT,
        "device.power"
    )

    override fun status() = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)

    override fun start(sink: EvidenceSink) {
        this.sink = sink
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

        val battery = appContext.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return
        val plugged = battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
        val plugKind = when (plugged) {
            BatteryManager.BATTERY_PLUGGED_AC -> "ac"
            BatteryManager.BATTERY_PLUGGED_USB -> "usb"
            BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
            BatteryManager.BATTERY_PLUGGED_DOCK -> "dock"
            else -> "none"
        }
        val level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        val pct = if (level >= 0 && scale > 0) ((level * 100.0 / scale).toInt()).coerceIn(0, 100) else null
        val status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, BatteryManager.BATTERY_STATUS_UNKNOWN)
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL || plugKind != "none"
        val nowWall = System.currentTimeMillis()

        val observation = AtlasSignalObservation(
            AtlasSignalKind.CHARGING,
            "charge:$plugKind",
            "device.power",
            pct?.toFloat(),
            0.25f,
            sourceHealthy = true
        )
        onAtlasScan(AtlasScan(nowElapsed, nowWall, 0.25f, listOf(observation)))

        val payload = JSONObject()
            .put("v", 1)
            .put("charging", charging)
            .put("plug", plugKind)
            .put("pct", pct ?: JSONObject.NULL)
            .toString().toByteArray(Charsets.UTF_8)
        if (payload.size <= EvidenceProtocol.MAX_RECORD_PAYLOAD_BYTES) {
            sink?.emit(EvidenceObservation(
                elapsedRealtimeMs = nowElapsed,
                wallTimeMs = nowWall,
                provider = EvidenceProviderId.COMPANION,
                family = EvidenceFamily.COMPANION,
                independenceGroup = "device.power",
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
