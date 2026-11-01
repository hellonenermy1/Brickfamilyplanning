package com.brick.safety.atlas

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.telephony.*
import androidx.core.content.ContextCompat
import com.brick.safety.evidence.*
import org.json.JSONArray
import org.json.JSONObject

class CellularEnvironmentProvider(
    context: Context,
    private val onAtlasScan: (AtlasScan) -> Unit
) : EvidenceProvider {
    companion object {
        private const val MAX_CELL_AGE_MS = 120_000L
        private const val MAX_ATLAS_CELLS = 12
        private const val MAX_EVIDENCE_CELLS = 8
    }

    private val appContext = context.applicationContext
    private val telephony = appContext.getSystemService(TelephonyManager::class.java)
    @Volatile private var sink: EvidenceSink? = null
    @Volatile private var decision = EvidenceSamplingDecision(false, null)
    @Volatile private var lastCollectElapsedMs = 0L
    @Volatile private var latestStatus = EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "not_started")

    override val descriptor = EvidenceProviderDescriptor(
        EvidenceProviderId.CELLULAR,
        EvidenceFamily.CELLULAR,
        EvidenceSamplingClass.NETWORK_CONTEXT,
        "cell.env"
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

    @SuppressLint("MissingPermission")
    override fun collectNow() {
        val gate = capabilityStatus()
        if (!decision.enabled || gate.capability != ProviderCapability.SUPPORTED) {
            latestStatus = gate
            return
        }
        val nowElapsed = SystemClock.elapsedRealtime()
        decision.intervalMs?.let { interval ->
            if (lastCollectElapsedMs > 0L && nowElapsed >= lastCollectElapsedMs && nowElapsed - lastCollectElapsedMs < interval) return
        }
        lastCollectElapsedMs = nowElapsed

        val cells = runCatching { telephony.allCellInfo.orEmpty() }.getOrElse {
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "cell_info_unavailable")
            return
        }.mapNotNull { normalize(it, nowElapsed) }
            .sortedWith(compareByDescending<NormalizedCell> { it.registered }.thenByDescending { it.signalDbm ?: -200 })
            .take(MAX_ATLAS_CELLS)

        if (cells.isEmpty()) {
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "lte_nr_unavailable")
            return
        }

        val nowWall = System.currentTimeMillis()
        val observations = cells.map { cell ->
            AtlasSignalObservation(
                AtlasSignalKind.CELLULAR,
                cell.id,
                "cell.env",
                cell.signalDbm?.toFloat(),
                cell.quality,
                sourceHealthy = true
            )
        }
        val quality = cells.maxOf { it.quality }.coerceIn(0.2f, 0.85f)
        onAtlasScan(AtlasScan(nowElapsed, nowWall, quality, observations))
        emitEvidence(cells, nowElapsed, nowWall, quality)
        latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }

    override fun stop() {
        sink = null
    }

    private data class NormalizedCell(
        val id: String,
        val radio: String,
        val registered: Boolean,
        val signalDbm: Int?,
        val rsrq: Int?,
        val sinr: Int?,
        val timingAdvance: Int?,
        val channel: Int?,
        val bands: List<Int>,
        val quality: Float
    )

    @Suppress("DEPRECATION")
    private fun normalize(info: CellInfo, nowElapsed: Long): NormalizedCell? {
        val observedElapsed = info.timeStamp / 1_000_000L
        if (observedElapsed <= 0L || observedElapsed > nowElapsed) return null
        val age = nowElapsed - observedElapsed
        if (age > MAX_CELL_AGE_MS) return null
        val freshness = (1f - age.toFloat() / MAX_CELL_AGE_MS).coerceIn(0.2f, 1f)
        return when (info) {
            is CellInfoLte -> normalizeLte(info, freshness)
            is CellInfoNr -> normalizeNr(info, freshness)
            else -> null
        }
    }

    private fun normalizeLte(info: CellInfoLte, freshness: Float): NormalizedCell? {
        val identity = info.cellIdentity
        val signal = info.cellSignalStrength
        val ci = identity.ci.takeIf(::availableInt)
        val pci = identity.pci.takeIf(::availableInt)
        val tac = identity.tac.takeIf(::availableInt)
        val earfcn = identity.earfcn.takeIf(::availableInt)
        val mcc = identity.mccString.orEmpty()
        val mnc = identity.mncString.orEmpty()
        if (ci == null && pci == null && tac == null) return null
        val rawIdentity = "lte|$mcc|$mnc|${ci ?: -1}|${pci ?: -1}|${tac ?: -1}|${earfcn ?: -1}"
        val dbm = signal.rsrp.takeIf(::availableInt) ?: signal.dbm.takeIf(::availableInt)
        val rsrq = signal.rsrq.takeIf(::availableInt)
        val sinr = signal.rssnr.takeIf(::availableInt)
        val ta = signal.timingAdvance.takeIf(::availableInt)
        val bands = if (Build.VERSION.SDK_INT >= 30) identity.bands.filter { it > 0 }.take(4) else emptyList()
        return NormalizedCell(
            AtlasPrivacyId.reduce("cell", rawIdentity),
            "lte",
            info.isRegistered,
            dbm,
            rsrq,
            sinr,
            ta,
            earfcn,
            bands,
            qualityFor(dbm, info.isRegistered, freshness)
        )
    }

    private fun normalizeNr(info: CellInfoNr, freshness: Float): NormalizedCell? {
        val identity = info.cellIdentity as? CellIdentityNr ?: return null
        val signal = info.cellSignalStrength as? CellSignalStrengthNr ?: return null
        val nci = identity.nci.takeIf { it != CellInfo.UNAVAILABLE_LONG && it >= 0L }
        val pci = identity.pci.takeIf(::availableInt)
        val tac = identity.tac.takeIf(::availableInt)
        val nrarfcn = identity.nrarfcn.takeIf(::availableInt)
        val mcc = identity.mccString.orEmpty()
        val mnc = identity.mncString.orEmpty()
        if (nci == null && pci == null && tac == null) return null
        val rawIdentity = "nr|$mcc|$mnc|${nci ?: -1}|${pci ?: -1}|${tac ?: -1}|${nrarfcn ?: -1}"
        val dbm = signal.ssRsrp.takeIf(::availableInt) ?: signal.dbm.takeIf(::availableInt)
        val rsrq = signal.ssRsrq.takeIf(::availableInt)
        val sinr = signal.ssSinr.takeIf(::availableInt)
        val ta = if (Build.VERSION.SDK_INT >= 34) signal.timingAdvanceMicros.takeIf(::availableInt) else null
        val bands = if (Build.VERSION.SDK_INT >= 30) identity.bands.filter { it > 0 }.take(4) else emptyList()
        return NormalizedCell(
            AtlasPrivacyId.reduce("cell", rawIdentity),
            "nr",
            info.isRegistered,
            dbm,
            rsrq,
            sinr,
            ta,
            nrarfcn,
            bands,
            qualityFor(dbm, info.isRegistered, freshness)
        )
    }

    private fun qualityFor(dbm: Int?, registered: Boolean, freshness: Float): Float {
        val strength = when (dbm) {
            null -> 0.35f
            in -85..0 -> 0.95f
            in -100..-86 -> 0.75f
            in -115..-101 -> 0.50f
            else -> 0.30f
        }
        val registeredFactor = if (registered) 1f else 0.72f
        return (strength * 0.55f + freshness * 0.30f + registeredFactor * 0.15f).coerceIn(0.15f, 0.90f)
    }

    private fun emitEvidence(cells: List<NormalizedCell>, elapsed: Long, wall: Long, quality: Float) {
        val payload = JSONObject()
            .put("v", 1)
            .put("q", quality.toDouble())
            .put("cells", JSONArray().also { array ->
                cells.take(MAX_EVIDENCE_CELLS).forEach { cell ->
                    array.put(JSONObject()
                        .put("id", cell.id)
                        .put("r", cell.radio)
                        .put("reg", cell.registered)
                        .put("dbm", cell.signalDbm ?: JSONObject.NULL)
                        .put("rsrq", cell.rsrq ?: JSONObject.NULL)
                        .put("sinr", cell.sinr ?: JSONObject.NULL)
                        .put("ta", cell.timingAdvance ?: JSONObject.NULL)
                        .put("ch", cell.channel ?: JSONObject.NULL)
                        .put("bands", JSONArray(cell.bands)))
                }
            })
            .toString().toByteArray(Charsets.UTF_8)
        if (payload.size > EvidenceProtocol.MAX_RECORD_PAYLOAD_BYTES) return
        sink?.emit(EvidenceObservation(
            elapsedRealtimeMs = elapsed,
            wallTimeMs = wall,
            provider = EvidenceProviderId.CELLULAR,
            family = EvidenceFamily.CELLULAR,
            independenceGroup = "cell.env",
            capability = ProviderCapability.SUPPORTED,
            health = ProviderHealth.HEALTHY,
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
        if (!appContext.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY_RADIO_ACCESS)) {
            return EvidenceProviderStatus(ProviderCapability.UNSUPPORTED, ProviderHealth.UNAVAILABLE, "no_telephony_radio")
        }
        return EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }

    private fun availableInt(value: Int): Boolean = value != CellInfo.UNAVAILABLE
}
