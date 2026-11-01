package com.brick.safety.privileged

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.net.wifi.ScanResult as WifiScanResult
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.telephony.CellIdentityCdma
import android.telephony.CellIdentityGsm
import android.telephony.CellIdentityLte
import android.telephony.CellIdentityNr
import android.telephony.CellIdentityWcdma
import android.telephony.CellInfoCdma
import android.telephony.CellInfoGsm
import android.telephony.CellInfoLte
import android.telephony.CellInfoNr
import android.telephony.CellInfoWcdma
import android.telephony.TelephonyManager
import androidx.annotation.Keep
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * Shizuku UserService. This process runs with Shizuku's shell/root identity, but exposes only the
 * fixed AIDL operations in IBrickPrivilegedService. runFixed() is private and every caller supplies
 * a hard-coded command family; normal Brick code can never submit arbitrary shell text.
 */
@Keep
class BrickShizukuUserService() : IBrickPrivilegedService.Stub() {
    companion object {
        private const val BRICK_PACKAGE = "com.brick.safety"
        private const val COMMAND_TIMEOUT_MS = 4_000L
        private const val BLE_SCAN_MS = 2_500L
        private const val MAX_ROWS = 32
        private const val IDLE_EXIT_MS = 5 * 60_000L
        private const val MAX_OUTPUT_BYTES = 16 * 1024
    }

    @Volatile private var serviceContext: Context? = null
    private val lastUseElapsed = AtomicLong(android.os.SystemClock.elapsedRealtime())

    constructor(context: Context) : this() {
        serviceContext = context
    }

    init {
        Thread({
            while (true) {
                try { Thread.sleep(30_000L) } catch (_: InterruptedException) { return@Thread }
                val idle = android.os.SystemClock.elapsedRealtime() - lastUseElapsed.get()
                if (idle >= IDLE_EXIT_MS) {
                    System.exit(0)
                    return@Thread
                }
            }
        }, "brick-shizuku-idle-guard").apply { isDaemon = true }.start()
    }

    private data class FixedResult(val exitCode: Int, val output: String)

    private fun touch() {
        lastUseElapsed.set(android.os.SystemClock.elapsedRealtime())
    }

    private fun hasPermission(context: Context, permission: String): Boolean =
        context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    private fun readAtMost(input: InputStream, maxBytes: Int): ByteArray {
        require(maxBytes >= 0)
        if (maxBytes == 0) return ByteArray(0)
        val buffer = ByteArray(minOf(8 * 1024, maxBytes))
        val output = ByteArrayOutputStream(minOf(8 * 1024, maxBytes))
        var remaining = maxBytes
        while (remaining > 0) {
            val count = input.read(buffer, 0, minOf(buffer.size, remaining))
            if (count < 0) break
            if (count == 0) continue
            output.write(buffer, 0, count)
            remaining -= count
        }
        return output.toByteArray()
    }

    private fun runFixed(vararg command: String, timeoutMs: Long = COMMAND_TIMEOUT_MS): FixedResult {
        touch()
        require(command.isNotEmpty())
        val process = ProcessBuilder(*command).redirectErrorStream(true).start()
        if (!process.waitFor(timeoutMs, TimeUnit.MILLISECONDS)) {
            process.destroyForcibly()
            throw IllegalStateException("privileged operation timed out")
        }
        val bytes = process.inputStream.use { readAtMost(it, MAX_OUTPUT_BYTES) }
        return FixedResult(process.exitValue(), bytes.toString(Charsets.UTF_8).trim())
    }

    @SuppressLint("MissingPermission")
    private fun wifiScanResultsOrNull(context: Context, manager: WifiManager): List<WifiScanResult>? {
        // getScanResults() still requires fine location for apps targeting Android 10+.
        if (!hasPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)) return null
        return try {
            manager.scanResults.orEmpty()
        } catch (_: SecurityException) {
            // Permission/location policy can change between the check and the platform call.
            null
        }
    }

    private fun hasBleScanPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            hasPermission(context, Manifest.permission.BLUETOOTH_SCAN)
        } else {
            hasPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }

    @SuppressLint("MissingPermission")
    private fun startBleScanSafely(
        context: Context,
        scanner: BluetoothLeScanner,
        settings: ScanSettings,
        callback: ScanCallback,
    ): Boolean {
        if (!hasBleScanPermission(context)) return false
        return try {
            scanner.startScan(null, settings, callback)
            true
        } catch (_: SecurityException) {
            false
        }
    }

    @SuppressLint("MissingPermission")
    private fun stopBleScanSafely(
        context: Context,
        scanner: BluetoothLeScanner,
        callback: ScanCallback,
    ) {
        if (!hasBleScanPermission(context)) return
        try {
            scanner.stopScan(callback)
        } catch (_: SecurityException) {
            // Best effort: permission can be revoked while a scan is active.
        }
    }

    private fun locationEnabled(): Boolean {
        val result = runFixed("cmd", "location", "is-location-enabled")
        if (result.exitCode != 0) throw IllegalStateException("location query unavailable")
        return when (result.output.lowercase()) {
            "true" -> true
            "false" -> false
            else -> throw IllegalStateException("location query returned unexpected state")
        }
    }

    override fun capabilities(): Bundle {
        touch()
        val out = Bundle()
        out.putBoolean("locationControl", runCatching { locationEnabled(); true }.getOrDefault(false))
        out.putBoolean("wifiEvidence", runCatching { serviceContext?.getSystemService(WifiManager::class.java) != null }.getOrDefault(false))
        out.putBoolean("bleEvidence", runCatching { BluetoothAdapter.getDefaultAdapter()?.bluetoothLeScanner != null }.getOrDefault(false))
        out.putBoolean("cellEvidence", runCatching { serviceContext?.getSystemService(TelephonyManager::class.java) != null }.getOrDefault(false))
        val power = runCatching { runFixed("cmd", "deviceidle", "whitelist").exitCode == 0 }.getOrDefault(false)
        out.putBoolean("powerDiagnostics", power)
        out.putBoolean("powerRepair", power)
        out.putBoolean("sosLocation", out.getBoolean("locationControl"))
        return out
    }

    override fun setLocationEnabled(enabled: Boolean): Boolean {
        val result = runFixed("cmd", "location", "set-location-enabled", enabled.toString())
        if (result.exitCode != 0) return false
        return runCatching { locationEnabled() == enabled }.getOrDefault(false)
    }

    override fun wifiEvidence(): Bundle {
        touch()
        val out = Bundle()
        val context = serviceContext
            ?: return out.apply { putBoolean("supported", false); putString("error", "service context unavailable") }
        val manager = context.getSystemService(WifiManager::class.java)
            ?: return out.apply { putBoolean("supported", false); putString("error", "wifi manager unavailable") }
        val results = wifiScanResultsOrNull(context, manager)
            ?: return out.apply { putBoolean("supported", false); putString("error", "wifi scan permission unavailable") }
        return try {
            val ranked = results.sortedByDescending { it.level }.take(MAX_ROWS)
            val rows = ArrayList<Bundle>(ranked.size)
            for (scan in ranked) {
                val bssid = scan.BSSID?.takeIf { it.isNotBlank() }
                @Suppress("DEPRECATION") val ssid = scan.SSID?.takeIf { it.isNotBlank() && it != "<unknown ssid>" }
                if (bssid == null && ssid == null) continue
                rows += Bundle().apply {
                    putString("ssid", ssid)
                    putString("bssid", bssid)
                    putInt("rssi", scan.level)
                    putInt("frequency", scan.frequency)
                }
            }
            out.apply { putBoolean("supported", true); putParcelableArrayList("rows", rows) }
        } catch (_: Throwable) {
            out.apply { putBoolean("supported", false); putString("error", "wifi evidence unavailable") }
        }
    }

    override fun bleEvidence(): Bundle {
        touch()
        val out = Bundle()
        val context = serviceContext
            ?: return out.apply { putBoolean("supported", false); putString("error", "service context unavailable") }
        if (!hasBleScanPermission(context)) {
            return out.apply { putBoolean("supported", false); putString("error", "ble scan permission unavailable") }
        }
        val scanner = runCatching { BluetoothAdapter.getDefaultAdapter()?.bluetoothLeScanner }.getOrNull()
            ?: return out.apply { putBoolean("supported", false); putString("error", "ble scanner unavailable") }
        val seen = ConcurrentHashMap<String, Int>()
        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val address = runCatching { result.device.address }.getOrNull()?.takeIf { it.isNotBlank() } ?: return
                seen.merge(address, result.rssi) { a, b -> maxOf(a, b) }
            }

            override fun onBatchScanResults(results: MutableList<ScanResult>) {
                results.forEach { onScanResult(0, it) }
            }
        }
        return try {
            val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_POWER).build()
            if (!startBleScanSafely(context, scanner, settings, callback)) {
                return out.apply { putBoolean("supported", false); putString("error", "ble scan permission unavailable") }
            }
            CountDownLatch(1).await(BLE_SCAN_MS, TimeUnit.MILLISECONDS)
            stopBleScanSafely(context, scanner, callback)
            val rows = ArrayList<Bundle>()
            seen.entries.sortedByDescending { it.value }.take(MAX_ROWS).forEach { (id, rssi) ->
                rows += Bundle().apply { putString("id", id); putInt("rssi", rssi) }
            }
            out.apply { putBoolean("supported", true); putParcelableArrayList("rows", rows) }
        } catch (_: Throwable) {
            stopBleScanSafely(context, scanner, callback)
            out.apply { putBoolean("supported", false); putString("error", "ble evidence unavailable") }
        }
    }

    override fun cellEvidence(): Bundle {
        touch()
        val out = Bundle()
        val telephony = serviceContext?.getSystemService(TelephonyManager::class.java)
            ?: return out.apply { putBoolean("supported", false); putString("error", "telephony unavailable") }
        return try {
            @Suppress("MissingPermission")
            val info = telephony.allCellInfo.orEmpty().take(MAX_ROWS)
            val rows = ArrayList<Bundle>()
            for (cell in info) {
                val row = Bundle()
                when (cell) {
                    is CellInfoNr -> {
                        val id = cell.cellIdentity as CellIdentityNr
                        row.putString("radio", "nr")
                        row.putString("identity", "${id.nci}:${id.tac}:${id.pci}")
                        row.putInt("dbm", cell.cellSignalStrength.dbm)
                    }
                    is CellInfoLte -> {
                        val id: CellIdentityLte = cell.cellIdentity
                        row.putString("radio", "lte")
                        row.putString("identity", "${id.ci}:${id.tac}:${id.pci}")
                        row.putInt("dbm", cell.cellSignalStrength.dbm)
                    }
                    is CellInfoWcdma -> {
                        val id: CellIdentityWcdma = cell.cellIdentity
                        row.putString("radio", "wcdma")
                        row.putString("identity", "${id.cid}:${id.lac}:${id.psc}")
                        row.putInt("dbm", cell.cellSignalStrength.dbm)
                    }
                    is CellInfoGsm -> {
                        val id: CellIdentityGsm = cell.cellIdentity
                        row.putString("radio", "gsm")
                        row.putString("identity", "${id.cid}:${id.lac}")
                        row.putInt("dbm", cell.cellSignalStrength.dbm)
                    }
                    is CellInfoCdma -> {
                        val id: CellIdentityCdma = cell.cellIdentity
                        row.putString("radio", "cdma")
                        row.putString("identity", "${id.systemId}:${id.networkId}:${id.basestationId}")
                        row.putInt("dbm", cell.cellSignalStrength.dbm)
                    }
                    else -> continue
                }
                rows += row
            }
            out.apply { putBoolean("supported", true); putParcelableArrayList("rows", rows) }
        } catch (_: Throwable) {
            out.apply { putBoolean("supported", false); putString("error", "cell evidence unavailable") }
        }
    }

    override fun powerDiagnostics(): Bundle {
        touch()
        val out = Bundle()
        return try {
            val whitelist = runFixed("cmd", "deviceidle", "whitelist")
            val whitelisted = whitelist.exitCode == 0 && whitelist.output.lineSequence().any { it.trim().endsWith(BRICK_PACKAGE) }
            val appOps = runCatching { runFixed("cmd", "appops", "get", BRICK_PACKAGE, "RUN_ANY_IN_BACKGROUND") }.getOrNull()
            val restricted = appOps?.takeIf { it.exitCode == 0 }?.output?.lowercase()?.let { text ->
                when {
                    "deny" in text || "ignore" in text -> true
                    "allow" in text -> false
                    else -> null
                }
            }
            out.putBoolean("supported", whitelist.exitCode == 0)
            out.putBoolean("batteryOptimizationExempt", whitelisted)
            if (restricted != null) out.putBoolean("backgroundRestricted", restricted)
            out.putString("detail", "deviceidle=${if (whitelisted) "whitelisted" else "not_whitelisted"};appops=${when (restricted) { true -> "restricted"; false -> "allowed"; null -> "unknown" }}")
            out
        } catch (_: Throwable) {
            out.apply { putBoolean("supported", false); putString("error", "power diagnostics unavailable") }
        }
    }

    override fun requestPowerRepair(): Boolean {
        val result = runFixed("cmd", "deviceidle", "whitelist", "+$BRICK_PACKAGE")
        if (result.exitCode != 0) return false
        return runCatching {
            val verify = runFixed("cmd", "deviceidle", "whitelist")
            verify.exitCode == 0 && verify.output.lineSequence().any { it.trim().endsWith(BRICK_PACKAGE) }
        }.getOrDefault(false)
    }

    override fun attemptSosLocationEnable(): Boolean = setLocationEnabled(true)

    override fun destroy() {
        Thread {
            try { Thread.sleep(100L) } catch (_: InterruptedException) { }
            System.exit(0)
        }.start()
    }
}
