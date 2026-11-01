package com.brick.safety.privileged

import android.bluetooth.BluetoothAdapter
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.net.wifi.WifiManager
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
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * Shizuku UserService. This process runs with Shizuku's shell/root identity, but exposes only the
 * fixed AIDL operations in IBrickPrivilegedService. runFixed() is private and every caller supplies
 * a hard-coded command family; normal Brick code can never submit arbitrary shell text.
 */
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

    private fun runFixed(vararg command: String, timeoutMs: Long = COMMAND_TIMEOUT_MS): FixedResult {
        touch()
        require(command.isNotEmpty())
        val process = ProcessBuilder(*command).redirectErrorStream(true).start()
        if (!process.waitFor(timeoutMs, TimeUnit.MILLISECONDS)) {
            process.destroyForcibly()
            throw IllegalStateException("privileged operation timed out")
        }
        val bytes = process.inputStream.use { it.readNBytes(MAX_OUTPUT_BYTES) }
        return FixedResult(process.exitValue(), bytes.toString(Charsets.UTF_8).trim())
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
        val manager = serviceContext?.getSystemService(WifiManager::class.java)
            ?: return out.apply { putBoolean("supported", false); putString("error", "wifi manager unavailable") }
        return try {
            @Suppress("DEPRECATION")
            val results = manager.scanResults.orEmpty().sortedByDescending { it.level }.take(MAX_ROWS)
            val rows = ArrayList<Bundle>(results.size)
            for (scan in results) {
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
            scanner.startScan(null, settings, callback)
            CountDownLatch(1).await(BLE_SCAN_MS, TimeUnit.MILLISECONDS)
            runCatching { scanner.stopScan(callback) }
            val rows = ArrayList<Bundle>()
            seen.entries.sortedByDescending { it.value }.take(MAX_ROWS).forEach { (id, rssi) ->
                rows += Bundle().apply { putString("id", id); putInt("rssi", rssi) }
            }
            out.apply { putBoolean("supported", true); putParcelableArrayList("rows", rows) }
        } catch (_: Throwable) {
            runCatching { scanner.stopScan(callback) }
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
