package com.brick.safety.atlas

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.*
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.brick.safety.evidence.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToInt

class BleEnvironmentProvider(
    context: Context,
    private val onAtlasScan: (AtlasScan) -> Unit
) : EvidenceProvider {
    companion object {
        private const val MAX_ATLAS_DEVICES = 32
        private const val MAX_EVIDENCE_DEVICES = 10
    }

    private data class Aggregate(
        val id: String,
        val manufacturerIds: List<Int>,
        val serviceIds: List<String>,
        val txPower: Int?,
        val advertisingSid: Int?,
        val primaryPhy: Int,
        val secondaryPhy: Int,
        var count: Int = 0,
        var rssiSum: Int = 0,
        var strongestRssi: Int = -127
    ) {
        fun add(rssi: Int) {
            count += 1
            rssiSum += rssi
            if (rssi > strongestRssi) strongestRssi = rssi
        }
        fun meanRssi(): Int = if (count <= 0) strongestRssi else (rssiSum.toDouble() / count).roundToInt()
    }

    private val appContext = context.applicationContext
    private val bluetoothManager = appContext.getSystemService(BluetoothManager::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private val scanning = AtomicBoolean(false)
    private val aggregates = linkedMapOf<String, Aggregate>()
    @Volatile private var sink: EvidenceSink? = null
    @Volatile private var decision = EvidenceSamplingDecision(false, null)
    @Volatile private var lastCollectElapsedMs = 0L
    @Volatile private var scanStartElapsedMs = 0L
    @Volatile private var latestStatus = EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "not_started")

    override val descriptor = EvidenceProviderDescriptor(
        EvidenceProviderId.BLE_ENVIRONMENT,
        EvidenceFamily.BLE,
        EvidenceSamplingClass.RADIO_BURST,
        "ble.scan"
    )

    private val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) { consume(result) }
        override fun onBatchScanResults(results: MutableList<ScanResult>) { results.forEach(::consume) }
        override fun onScanFailed(errorCode: Int) {
            scanning.set(false)
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "scan_failed_$errorCode")
        }
    }

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
        if (scanning.get()) return
        val now = SystemClock.elapsedRealtime()
        decision.intervalMs?.let { interval ->
            if (lastCollectElapsedMs > 0L && now >= lastCollectElapsedMs && now - lastCollectElapsedMs < interval) return
        }
        val scanner = bluetoothManager.adapter?.bluetoothLeScanner ?: run {
            latestStatus = EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "scanner_unavailable")
            return
        }
        if (!scanning.compareAndSet(false, true)) return
        lastCollectElapsedMs = now
        scanStartElapsedMs = now
        synchronized(aggregates) { aggregates.clear() }
        val burst = (decision.maxBurstMs ?: 2_500L).coerceIn(1_000L, 4_000L)
        val scanMode = when {
            decision.intervalMs != null && decision.intervalMs!! <= 15_000L -> ScanSettings.SCAN_MODE_LOW_LATENCY
            decision.intervalMs != null && decision.intervalMs!! <= 30_000L -> ScanSettings.SCAN_MODE_BALANCED
            else -> ScanSettings.SCAN_MODE_LOW_POWER
        }
        val settings = ScanSettings.Builder().setScanMode(scanMode).setReportDelay(0L).build()
        runCatching { scanner.startScan(null, settings, callback) }
            .onSuccess {
                latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
                handler.postDelayed({ finishScan() }, burst)
            }
            .onFailure {
                scanning.set(false)
                latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "scan_start_failed")
            }
    }

    @SuppressLint("MissingPermission")
    override fun stop() {
        handler.removeCallbacksAndMessages(null)
        if (scanning.compareAndSet(true, false)) {
            runCatching { bluetoothManager.adapter?.bluetoothLeScanner?.stopScan(callback) }
        }
        sink = null
    }

    private fun consume(result: ScanResult) {
        if (!scanning.get()) return
        val record = result.scanRecord ?: return
        val fingerprint = fingerprint(record) ?: return
        val id = runCatching { AtlasPrivacyId.reduce("ble", fingerprint.rawIdentity) }.getOrNull() ?: return
        val aggregate = synchronized(aggregates) {
            aggregates[id] ?: Aggregate(
                id,
                fingerprint.manufacturerIds,
                fingerprint.serviceIds,
                result.txPower.takeIf { it != ScanResult.TX_POWER_NOT_PRESENT },
                result.advertisingSid.takeIf { it != ScanResult.SID_NOT_PRESENT },
                result.primaryPhy,
                result.secondaryPhy
            ).also { aggregates[id] = it }
        }
        synchronized(aggregate) { aggregate.add(result.rssi.coerceIn(-127, 20)) }
    }

    private data class Fingerprint(
        val rawIdentity: String,
        val manufacturerIds: List<Int>,
        val serviceIds: List<String>
    )

    private fun fingerprint(record: android.bluetooth.le.ScanRecord): Fingerprint? {
        val components = arrayListOf<String>()
        val manufacturers = arrayListOf<Int>()
        val manufacturerData = record.manufacturerSpecificData
        for (i in 0 until manufacturerData.size()) {
            val company = manufacturerData.keyAt(i)
            val bytes = manufacturerData.valueAt(i) ?: continue
            if (bytes.isEmpty()) continue
            manufacturers += company
            components += "m:$company:${AtlasPrivacyId.reduce("blemfr", bytes.toHex())}"
        }

        val serviceIds = record.serviceUuids.orEmpty().map { uuid ->
            AtlasPrivacyId.reduce("blesvc", uuid.uuid.toString().lowercase())
        }.sorted().take(8)
        components += serviceIds.map { "u:$it" }

        record.serviceData.entries.sortedBy { it.key.uuid.toString() }.take(8).forEach { (uuid, bytes) ->
            if (bytes.isNotEmpty()) components += "d:${AtlasPrivacyId.reduce("blesvc", uuid.uuid.toString())}:${AtlasPrivacyId.reduce("bledata", bytes.toHex())}"
        }
        if (components.isEmpty()) return null
        return Fingerprint(components.sorted().joinToString("|"), manufacturers.distinct().sorted().take(8), serviceIds)
    }

    @SuppressLint("MissingPermission")
    private fun finishScan() {
        if (!scanning.compareAndSet(true, false)) return
        runCatching { bluetoothManager.adapter?.bluetoothLeScanner?.stopScan(callback) }
        val nowElapsed = SystemClock.elapsedRealtime()
        val nowWall = System.currentTimeMillis()
        val copy = synchronized(aggregates) { aggregates.values.toList() }
            .filter { it.count > 0 }
            .sortedWith(compareByDescending<Aggregate> { it.strongestRssi }.thenByDescending { it.count })
            .take(MAX_ATLAS_DEVICES)
        if (copy.isEmpty()) {
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "no_identifiable_advertisements")
            return
        }
        val observations = copy.map { device ->
            val repeated = (device.count / 3f).coerceIn(0.35f, 1f)
            val signal = ((device.strongestRssi + 100) / 60f).coerceIn(0.20f, 1f)
            AtlasSignalObservation(
                AtlasSignalKind.BLE_DEVICE,
                device.id,
                "ble.scan",
                device.meanRssi().toFloat(),
                (repeated * 0.45f + signal * 0.55f).coerceIn(0.15f, 0.9f),
                sourceHealthy = true
            )
        }
        val scanQuality = (0.35f + copy.size.coerceAtMost(12) / 24f).coerceAtMost(0.85f)
        onAtlasScan(AtlasScan(nowElapsed, nowWall, scanQuality, observations))
        emitEvidence(copy, nowElapsed, nowWall, scanQuality)
        latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }

    private fun emitEvidence(devices: List<Aggregate>, elapsed: Long, wall: Long, quality: Float) {
        val duration = (elapsed - scanStartElapsedMs).coerceAtLeast(0L)
        val payload = JSONObject()
            .put("v", 1)
            .put("q", quality.toDouble())
            .put("dur", duration)
            .put("dev", JSONArray().also { array ->
                devices.take(MAX_EVIDENCE_DEVICES).forEach { d ->
                    array.put(JSONObject()
                        .put("id", d.id)
                        .put("r", d.meanRssi())
                        .put("max", d.strongestRssi)
                        .put("n", d.count)
                        .put("tx", d.txPower ?: JSONObject.NULL)
                        .put("mfr", JSONArray(d.manufacturerIds))
                        .put("svc", JSONArray(d.serviceIds))
                        .put("sid", d.advertisingSid ?: JSONObject.NULL)
                        .put("p", d.primaryPhy)
                        .put("s", d.secondaryPhy))
                }
            })
            .toString().toByteArray(Charsets.UTF_8)
        if (payload.size > EvidenceProtocol.MAX_RECORD_PAYLOAD_BYTES) return
        sink?.emit(EvidenceObservation(
            elapsedRealtimeMs = elapsed,
            wallTimeMs = wall,
            provider = EvidenceProviderId.BLE_ENVIRONMENT,
            family = EvidenceFamily.BLE,
            independenceGroup = "ble.scan",
            capability = ProviderCapability.SUPPORTED,
            health = ProviderHealth.HEALTHY,
            quality = if (quality >= 0.65f) EvidenceQuality.MEDIUM else EvidenceQuality.LOW,
            payload = payload
        ))
    }

    private fun capabilityStatus(): EvidenceProviderStatus {
        if (!appContext.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) {
            return EvidenceProviderStatus(ProviderCapability.UNSUPPORTED, ProviderHealth.UNAVAILABLE, "no_ble")
        }
        if (android.os.Build.VERSION.SDK_INT >= 31 &&
            ContextCompat.checkSelfPermission(appContext, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
            return EvidenceProviderStatus(ProviderCapability.PERMISSION_REQUIRED, ProviderHealth.UNAVAILABLE, "bluetooth_scan_permission")
        }
        if (android.os.Build.VERSION.SDK_INT < 31 &&
            ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return EvidenceProviderStatus(ProviderCapability.PERMISSION_REQUIRED, ProviderHealth.UNAVAILABLE, "fine_location_permission")
        }
        val adapter = bluetoothManager.adapter
        if (adapter == null) return EvidenceProviderStatus(ProviderCapability.UNSUPPORTED, ProviderHealth.UNAVAILABLE, "no_bluetooth_adapter")
        if (!adapter.isEnabled) return EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "bluetooth_off")
        return EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it.toInt() and 0xff) }
}
