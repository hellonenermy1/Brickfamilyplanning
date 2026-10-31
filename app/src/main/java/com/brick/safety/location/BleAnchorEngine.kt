package com.brick.safety.location

import android.Manifest
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

class BleAnchorEngine(
    private val context: Context,
    private val onAnchorSeen: (Config) -> Unit
) {
    data class Config(
        val geofenceId: String,
        val name: String,
        val beaconUuid: String,
        val latitude: Double,
        val longitude: Double,
        val radiusM: Float
    )

    companion object {
        private const val COMPANY_ID_APPLE = 0x004C
        private const val SCAN_WINDOW_MS = 8_000L
        private const val MIN_RSSI = -95
        private const val REQUIRED_DETECTIONS = 2
        private const val PREFS = "brick_ble_anchors"
        private const val CONFIG_JSON = "configs"
    }

    private val handler = Handler(Looper.getMainLooper())
    private val scanning = AtomicBoolean(false)
    @Volatile private var configs: List<Config> = loadConfigs()
    private val counts = HashMap<String, Int>()
    private val emitted = HashSet<String>()

    fun configuredCount(): Int = configs.size

    fun updateConfigs(next: List<Config>) {
        val normalized = next.filter {
            it.geofenceId.isNotBlank() && parseUuid(it.beaconUuid) != null &&
                it.latitude.isFinite() && it.latitude in -90.0..90.0 &&
                it.longitude.isFinite() && it.longitude in -180.0..180.0 &&
                it.radiusM.isFinite() && it.radiusM in 25f..5_000f
        }.distinctBy { it.beaconUuid.lowercase() }.take(8)
        configs = normalized
        persistConfigs(normalized)
        context.getSharedPreferences("brick", Context.MODE_PRIVATE).edit()
            .putInt("bleAnchorConfigCount", normalized.size)
            .apply()
    }

    fun permissionGranted(): Boolean = Build.VERSION.SDK_INT < 31 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED

    fun scanOnce() {
        val current = configs
        if (current.isEmpty() || !permissionGranted() || !scanning.compareAndSet(false, true)) return
        val scanner = runCatching { context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner }.getOrNull()
        if (scanner == null) {
            scanning.set(false)
            return
        }
        counts.clear(); emitted.clear()
        val filters = current.mapNotNull { config ->
            val uuid = parseUuid(config.beaconUuid) ?: return@mapNotNull null
            val bytes = uuidBytes(uuid)
            val data = ByteArray(18).also {
                it[0] = 0x02
                it[1] = 0x15
                bytes.copyInto(it, 2)
            }
            val mask = ByteArray(data.size) { 0xFF.toByte() }
            ScanFilter.Builder().setManufacturerData(COMPANY_ID_APPLE, data, mask).build()
        }
        if (filters.isEmpty()) {
            scanning.set(false)
            return
        }
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_POWER)
            .setReportDelay(0L)
            .build()
        try {
            scanner.startScan(filters, settings, callback)
            handler.postDelayed({
                if (scanning.compareAndSet(true, false)) runCatching { scanner.stopScan(callback) }
            }, SCAN_WINDOW_MS)
        } catch (_: SecurityException) {
            scanning.set(false)
        } catch (_: RuntimeException) {
            scanning.set(false)
        }
    }

    fun stop() {
        handler.removeCallbacksAndMessages(null)
        if (!scanning.compareAndSet(true, false)) return
        if (!permissionGranted()) return
        runCatching { context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner?.stopScan(callback) }
    }

    private val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) { consume(result) }
        override fun onBatchScanResults(results: MutableList<ScanResult>) { results.forEach(::consume) }
        override fun onScanFailed(errorCode: Int) { scanning.set(false) }
    }

    private fun consume(result: ScanResult) {
        if (result.rssi < MIN_RSSI) return
        val data = result.scanRecord?.getManufacturerSpecificData(COMPANY_ID_APPLE) ?: return
        val uuid = parseIBeaconUuid(data) ?: return
        val config = configs.firstOrNull { it.beaconUuid.equals(uuid, ignoreCase = true) } ?: return
        val count = (counts[uuid] ?: 0) + 1
        counts[uuid] = count
        if (count >= REQUIRED_DETECTIONS && emitted.add(uuid)) onAnchorSeen(config)
    }

    private fun parseIBeaconUuid(data: ByteArray): String? {
        if (data.size < 18 || data[0].toInt() and 0xFF != 0x02 || data[1].toInt() and 0xFF != 0x15) return null
        val bytes = data.copyOfRange(2, 18)
        val buffer = ByteBuffer.wrap(bytes)
        return UUID(buffer.long, buffer.long).toString().lowercase()
    }

    private fun parseUuid(value: String): UUID? = runCatching { UUID.fromString(value.trim()) }.getOrNull()

    private fun uuidBytes(uuid: UUID): ByteArray = ByteBuffer.allocate(16)
        .putLong(uuid.mostSignificantBits)
        .putLong(uuid.leastSignificantBits)
        .array()

    private fun persistConfigs(values: List<Config>) {
        val array = JSONArray()
        values.forEach { c ->
            array.put(JSONObject()
                .put("geofenceId", c.geofenceId)
                .put("name", c.name)
                .put("beaconUuid", c.beaconUuid.lowercase())
                .put("latitude", c.latitude)
                .put("longitude", c.longitude)
                .put("radiusM", c.radiusM.toDouble()))
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(CONFIG_JSON, array.toString()).apply()
    }

    private fun loadConfigs(): List<Config> {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CONFIG_JSON, null) ?: return emptyList()
        return runCatching {
            val array = JSONArray(raw)
            buildList {
                for (i in 0 until minOf(array.length(), 8)) {
                    val j = array.getJSONObject(i)
                    val config = Config(
                        j.getString("geofenceId"),
                        j.optString("name", "Trusted place").take(64),
                        j.getString("beaconUuid").lowercase(),
                        j.getDouble("latitude"),
                        j.getDouble("longitude"),
                        j.getDouble("radiusM").toFloat()
                    )
                    if (parseUuid(config.beaconUuid) != null && config.latitude in -90.0..90.0 && config.longitude in -180.0..180.0 && config.radiusM in 25f..5_000f) add(config)
                }
            }
        }.getOrDefault(emptyList())
    }
}
