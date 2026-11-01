package com.brick.safety.witness

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.brick.safety.evidence.EvidenceFamily
import com.brick.safety.evidence.EvidenceObservation
import com.brick.safety.evidence.EvidenceProvider
import com.brick.safety.evidence.EvidenceProviderDescriptor
import com.brick.safety.evidence.EvidenceProviderId
import com.brick.safety.evidence.EvidenceProviderStatus
import com.brick.safety.evidence.EvidenceQuality
import com.brick.safety.evidence.EvidenceSamplingClass
import com.brick.safety.evidence.EvidenceSamplingDecision
import com.brick.safety.evidence.EvidenceSink
import com.brick.safety.evidence.ProviderCapability
import com.brick.safety.evidence.ProviderHealth
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToInt

/**
 * Private Brick Witness Mesh radio provider.
 *
 * A stable Brick service UUID is used only as a scan filter. The public payload is a short HMAC-derived
 * alias that rotates every five minutes. No permanent child identifier or device ID is advertised.
 * RSSI is uploaded only as proximity evidence; server policy computes a conservative area and never
 * converts RSSI into an exact distance.
 */
class WitnessMeshProvider(context: Context) : EvidenceProvider {
    companion object {
        val SERVICE_UUID: UUID = UUID.fromString("5f9b1d60-f7b3-4e1b-a1a2-1e73b1475c01")
        private val SERVICE_PARCEL = ParcelUuid(SERVICE_UUID)
        private const val AD_PAYLOAD_VERSION: Byte = 1
        private const val REPORT_COOLDOWN_MS = 60_000L
        private const val OWN_POSITION_MAX_AGE_MS = 30_000L
        private const val OWN_POSITION_MAX_ACCURACY_M = 100f
        private const val ALIAS_AHEAD_TARGET_SLOTS = 24L
        private const val ALIAS_AHEAD_REFILL_SLOTS = 18L
        private const val MAX_ALIASES_PER_RECORD = 24
    }

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)
    private val positionPrefs = appContext.getSharedPreferences("brick_position", Context.MODE_PRIVATE)
    private val bluetoothManager = appContext.getSystemService(BluetoothManager::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private val scanning = AtomicBoolean(false)
    private val advertising = AtomicBoolean(false)
    private val lastReported = linkedMapOf<String, Long>()
    @Volatile private var sink: EvidenceSink? = null
    @Volatile private var decision = EvidenceSamplingDecision(false, null)
    @Volatile private var lastCollectElapsedMs = 0L
    @Volatile private var advertisedSlot = -1L
    @Volatile private var latestStatus = EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "not_started")

    override val descriptor = EvidenceProviderDescriptor(
        EvidenceProviderId.WITNESS,
        EvidenceFamily.WITNESS,
        EvidenceSamplingClass.RADIO_BURST,
        "witness.mesh"
    )

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            advertising.set(true)
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
            publishHealth()
        }

        override fun onStartFailure(errorCode: Int) {
            advertising.set(false)
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "advertise_failed_$errorCode")
            publishHealth()
        }
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) = consume(result)
        override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach(::consume)
        override fun onScanFailed(errorCode: Int) {
            scanning.set(false)
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "scan_failed_$errorCode")
            publishHealth()
        }
    }

    override fun status(): EvidenceProviderStatus = capabilityStatus().let { gate ->
        if (gate.capability != ProviderCapability.SUPPORTED) gate else latestStatus
    }

    override fun start(sink: EvidenceSink) {
        this.sink = sink
        latestStatus = capabilityStatus()
        ensureAliasesAndAdvertising()
        publishHealth()
    }

    override fun applySampling(decision: EvidenceSamplingDecision) {
        this.decision = decision
    }

    @SuppressLint("MissingPermission")
    override fun collectNow() {
        ensureAliasesAndAdvertising()
        val gate = capabilityStatus()
        if (!decision.enabled || gate.capability != ProviderCapability.SUPPORTED) {
            latestStatus = gate
            publishHealth()
            return
        }
        if (scanning.get()) return
        val now = SystemClock.elapsedRealtime()
        decision.intervalMs?.let { interval ->
            if (lastCollectElapsedMs > 0L && now >= lastCollectElapsedMs && now - lastCollectElapsedMs < interval) return
        }
        val scanner = runCatching { bluetoothManager.adapter?.bluetoothLeScanner }.getOrNull() ?: run {
            latestStatus = EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "scanner_unavailable")
            publishHealth()
            return
        }
        if (!scanning.compareAndSet(false, true)) return
        lastCollectElapsedMs = now
        val burstMs = (decision.maxBurstMs ?: 3_000L).coerceIn(1_000L, 4_000L)
        val mode = when {
            decision.intervalMs != null && decision.intervalMs!! <= 15_000L -> ScanSettings.SCAN_MODE_LOW_LATENCY
            decision.intervalMs != null && decision.intervalMs!! <= 30_000L -> ScanSettings.SCAN_MODE_BALANCED
            else -> ScanSettings.SCAN_MODE_LOW_POWER
        }
        val filter = ScanFilter.Builder().setServiceUuid(SERVICE_PARCEL).build()
        val settings = ScanSettings.Builder().setScanMode(mode).setReportDelay(0L).build()
        runCatching { scanner.startScan(listOf(filter), settings, scanCallback) }
            .onSuccess {
                if (latestStatus.health != ProviderHealth.DEGRADED) {
                    latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
                }
                handler.postDelayed({ finishScan() }, burstMs)
                publishHealth()
            }
            .onFailure {
                scanning.set(false)
                latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "scan_start_failed")
                publishHealth()
            }
    }

    @SuppressLint("MissingPermission")
    override fun stop() {
        handler.removeCallbacksAndMessages(null)
        if (scanning.compareAndSet(true, false)) {
            runCatching { bluetoothManager.adapter?.bluetoothLeScanner?.stopScan(scanCallback) }
        }
        if (advertising.compareAndSet(true, false)) {
            runCatching { bluetoothManager.adapter?.bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback) }
        }
        sink = null
        publishHealth()
    }

    @SuppressLint("MissingPermission")
    private fun ensureAliasesAndAdvertising() {
        val deviceId = prefs.getString("deviceId", null)?.takeIf { canonicalDeviceId(it) } ?: return
        val gate = capabilityStatus()
        if (gate.capability != ProviderCapability.SUPPORTED) {
            latestStatus = gate
            publishHealth()
            return
        }
        val nowWall = System.currentTimeMillis()
        if (nowWall <= 0L) return
        val slot = WitnessAliasKey.slotForWallTime(nowWall)
        registerAliasWindow(deviceId, slot, nowWall)
        if (advertisedSlot == slot && advertising.get()) return

        val advertiser = runCatching { bluetoothManager.adapter?.bluetoothLeAdvertiser }.getOrNull()
        if (advertiser == null) {
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "advertiser_unavailable")
            publishHealth()
            return
        }
        val token = runCatching { WitnessAliasKey.token(deviceId, slot) }.getOrElse {
            latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.FAILED, "alias_key_failed")
            publishHealth()
            return
        }
        val serviceData = ByteArray(1 + token.size).also {
            it[0] = AD_PAYLOAD_VERSION
            token.copyInto(it, destinationOffset = 1)
        }
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(SERVICE_PARCEL)
            .addServiceData(SERVICE_PARCEL, serviceData)
            .build()
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_POWER)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_LOW)
            .setConnectable(false)
            .setTimeout(0)
            .build()
        if (advertising.compareAndSet(true, false)) runCatching { advertiser.stopAdvertising(advertiseCallback) }
        advertisedSlot = slot
        runCatching { advertiser.startAdvertising(settings, data, advertiseCallback) }
            .onFailure {
                advertising.set(false)
                latestStatus = EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.DEGRADED, "advertise_start_failed")
                publishHealth()
            }
    }

    private fun registerAliasWindow(deviceId: String, currentSlot: Long, nowWall: Long) {
        val priorThrough = prefs.getLong("witnessAliasRegisteredThroughSlot", -1L)
        if (priorThrough >= currentSlot + ALIAS_AHEAD_REFILL_SLOTS) return
        val start = maxOf(currentSlot - 1L, priorThrough + 1L, 0L)
        val end = currentSlot + ALIAS_AHEAD_TARGET_SLOTS
        if (start > end) return
        var cursor = start
        var highestSaved = priorThrough
        while (cursor <= end) {
            val chunkEnd = minOf(end, cursor + MAX_ALIASES_PER_RECORD - 1L)
            val aliases = JSONArray()
            var slot = cursor
            while (slot <= chunkEnd) {
                val token = runCatching { WitnessAliasKey.tokenHex(deviceId, slot) }.getOrNull() ?: return
                aliases.put(JSONObject().put("a", token).put("s", slot))
                slot++
            }
            val payload = JSONObject().put("v", 1).put("t", "a").put("aliases", aliases).toString().toByteArray(Charsets.UTF_8)
            val saved = sink?.emit(EvidenceObservation(
                elapsedRealtimeMs = SystemClock.elapsedRealtime(),
                wallTimeMs = nowWall,
                provider = EvidenceProviderId.WITNESS,
                family = EvidenceFamily.WITNESS,
                independenceGroup = "witness.alias",
                capability = ProviderCapability.SUPPORTED,
                health = ProviderHealth.HEALTHY,
                quality = EvidenceQuality.HIGH,
                payload = payload
            )) == true
            if (!saved) break
            highestSaved = chunkEnd
            cursor = chunkEnd + 1L
        }
        if (highestSaved > priorThrough) prefs.edit().putLong("witnessAliasRegisteredThroughSlot", highestSaved).apply()
    }

    private fun consume(result: ScanResult) {
        if (!scanning.get()) return
        val data = result.scanRecord?.getServiceData(SERVICE_PARCEL) ?: return
        if (data.size != 1 + WitnessAliasKey.TOKEN_BYTES || data[0] != AD_PAYLOAD_VERSION) return
        val alias = data.copyOfRange(1, data.size).joinToString("") { "%02x".format(it.toInt() and 0xff) }
        val nowElapsed = SystemClock.elapsedRealtime()
        synchronized(lastReported) {
            val prior = lastReported[alias]
            if (prior != null && nowElapsed >= prior && nowElapsed - prior < REPORT_COOLDOWN_MS) return
        }
        val anchor = freshOwnPosition(nowElapsed) ?: return
        val payload = JSONObject()
            .put("v", 1)
            .put("t", "s")
            .put("a", alias)
            .put("latE7", (anchor.latitude * 10_000_000.0).roundToInt())
            .put("lonE7", (anchor.longitude * 10_000_000.0).roundToInt())
            .put("accCm", (anchor.accuracyM * 100f).roundToInt())
            .put("r", result.rssi.coerceIn(-127, 20))
            .put("tx", result.txPower.takeIf { it != ScanResult.TX_POWER_NOT_PRESENT } ?: JSONObject.NULL)
            .toString().toByteArray(Charsets.UTF_8)
        val saved = sink?.emit(EvidenceObservation(
            elapsedRealtimeMs = nowElapsed,
            wallTimeMs = System.currentTimeMillis(),
            provider = EvidenceProviderId.WITNESS,
            family = EvidenceFamily.WITNESS,
            independenceGroup = "witness.mesh",
            capability = ProviderCapability.SUPPORTED,
            health = ProviderHealth.HEALTHY,
            quality = if (anchor.accuracyM <= 30f) EvidenceQuality.MEDIUM else EvidenceQuality.LOW,
            payload = payload
        )) == true
        if (saved) {
            synchronized(lastReported) {
                lastReported[alias] = nowElapsed
                if (lastReported.size > 128) {
                    val cutoff = nowElapsed - 6L * REPORT_COOLDOWN_MS
                    lastReported.entries.removeAll { it.value < cutoff }
                    while (lastReported.size > 128) lastReported.remove(lastReported.keys.first())
                }
            }
            prefs.edit().putLong("lastWitnessSightingWallMs", System.currentTimeMillis()).apply()
        }
    }

    private data class OwnPosition(val latitude: Double, val longitude: Double, val accuracyM: Float)

    private fun freshOwnPosition(nowElapsed: Long): OwnPosition? {
        val elapsed = positionPrefs.getLong("anchorElapsedMs", 0L)
        if (elapsed !in 1..nowElapsed || nowElapsed - elapsed > OWN_POSITION_MAX_AGE_MS) return null
        val accuracy = positionPrefs.getFloat("anchorAccuracyM", Float.NaN)
        if (!accuracy.isFinite() || accuracy !in 0f..OWN_POSITION_MAX_ACCURACY_M) return null
        val lat = Double.fromBits(positionPrefs.getLong("anchorLatBits", 0L))
        val lon = Double.fromBits(positionPrefs.getLong("anchorLonBits", 0L))
        if (!lat.isFinite() || lat !in -90.0..90.0 || !lon.isFinite() || lon !in -180.0..180.0) return null
        return OwnPosition(lat, lon, accuracy)
    }

    @SuppressLint("MissingPermission")
    private fun finishScan() {
        if (!scanning.compareAndSet(true, false)) return
        runCatching { bluetoothManager.adapter?.bluetoothLeScanner?.stopScan(scanCallback) }
    }

    private fun capabilityStatus(): EvidenceProviderStatus {
        if (!appContext.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) {
            return EvidenceProviderStatus(ProviderCapability.UNSUPPORTED, ProviderHealth.UNAVAILABLE, "no_ble")
        }
        if (android.os.Build.VERSION.SDK_INT >= 31) {
            if (ContextCompat.checkSelfPermission(appContext, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                return EvidenceProviderStatus(ProviderCapability.PERMISSION_REQUIRED, ProviderHealth.UNAVAILABLE, "bluetooth_scan_permission")
            }
            if (ContextCompat.checkSelfPermission(appContext, Manifest.permission.BLUETOOTH_ADVERTISE) != PackageManager.PERMISSION_GRANTED) {
                return EvidenceProviderStatus(ProviderCapability.PERMISSION_REQUIRED, ProviderHealth.UNAVAILABLE, "bluetooth_advertise_permission")
            }
        } else if (ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return EvidenceProviderStatus(ProviderCapability.PERMISSION_REQUIRED, ProviderHealth.UNAVAILABLE, "fine_location_permission")
        }
        val adapter = runCatching { bluetoothManager.adapter }.getOrNull()
            ?: return EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "adapter_unavailable")
        val scanner = runCatching { adapter.bluetoothLeScanner }.getOrNull()
            ?: return EvidenceProviderStatus(ProviderCapability.TEMPORARILY_UNAVAILABLE, ProviderHealth.UNAVAILABLE, "scanner_unavailable")
        @Suppress("UNUSED_VARIABLE") val keepScanner = scanner
        return EvidenceProviderStatus(ProviderCapability.SUPPORTED, ProviderHealth.HEALTHY)
    }

    private fun publishHealth() {
        val s = status()
        prefs.edit()
            .putString("witnessMeshCapability", s.capability.name)
            .putString("witnessMeshHealth", s.health.name)
            .putString("witnessMeshReason", s.reason ?: "")
            .putBoolean("witnessAdvertising", advertising.get())
            .putBoolean("witnessScanning", scanning.get())
            .apply()
    }

    private fun canonicalDeviceId(value: String): Boolean {
        val parsed = runCatching { UUID.fromString(value) }.getOrNull() ?: return false
        return parsed.toString() == value && parsed.version() == 4 && parsed.variant() == 2
    }
}
