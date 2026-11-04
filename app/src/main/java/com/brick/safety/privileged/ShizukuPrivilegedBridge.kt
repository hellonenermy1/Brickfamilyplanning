package com.brick.safety.privileged

import android.content.ComponentName
import android.content.Context
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.DeadObjectException
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.RemoteException
import android.os.SystemClock
import com.brick.safety.atlas.AtlasPrivacyId
import com.brick.safety.maintenance.DeprovisionManager
import rikka.shizuku.Shizuku
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * App-process lifecycle/controller for the optional Shizuku UserService.
 * Brick Core never waits indefinitely for this controller and remains fully functional without it.
 */
object ShizukuBridgeController {
    private const val REQUEST_CODE = 6106
    private const val CALL_TIMEOUT_MS = 5_000L
    private const val BLE_CALL_TIMEOUT_MS = 7_000L
    private const val REBIND_DELAY_MS = 2_000L
    private const val CAPABILITY_POLL_MS = 100L

    @Volatile private var initialized = false
    @Volatile private var deprovisionShutdown = false
    private val deprovisionFence = Any()
    @Volatile private var foreground = false
    @Volatile private var binding = false
    @Volatile private var service: IBrickPrivilegedService? = null
    @Volatile private var serviceGeneration = 0L
    @Volatile private var capabilities: Set<PrivilegedCapability> = emptySet()
    @Volatile private var lastError: String? = null
    private lateinit var appContext: Context
    private val main = Handler(Looper.getMainLooper())
    private val remoteLane = RecoverableExecutorLane("brick-shizuku-call")

    private val connection: ServiceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            // Serialize the callback's service adoption with the permanent purge fence.
            // Without this lock, a callback can pass an early flag check and then publish a
            // connected service after shutdown has already cleared it.
            val rejected = synchronized(deprovisionFence) {
                if (deprovisionShutdown) {
                    binding = false
                    true
                } else {
                    binding = false
                    service = binder?.let { IBrickPrivilegedService.Stub.asInterface(it) }
                    serviceGeneration += 1L
                    lastError = if (service == null) "Shizuku service returned no binder" else null
                    false
                }
            }
            if (rejected) {
                runCatching { Shizuku.unbindUserService(args(), connection, true) }
                return
            }
            refreshCapabilities()
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            if (deprovisionShutdown) return
            binding = false
            service = null
            serviceGeneration += 1L
            capabilities = emptySet()
            lastError = "Shizuku user service disconnected"
            scheduleRebind()
        }

        override fun onBindingDied(name: ComponentName?) {
            onServiceDisconnected(name)
        }

        override fun onNullBinding(name: ComponentName?) {
            if (deprovisionShutdown) return
            binding = false
            service = null
            serviceGeneration += 1L
            capabilities = emptySet()
            lastError = "Shizuku user service unavailable"
        }
    }

    private val binderReceived = object : Shizuku.OnBinderReceivedListener {
        override fun onBinderReceived() {
            if (deprovisionShutdown) return
            lastError = null
            if (hasPermission()) bindNow() else maybeRequestPermission()
        }
    }

    private val binderDead = object : Shizuku.OnBinderDeadListener {
        override fun onBinderDead() {
            if (deprovisionShutdown) return
            binding = false
            service = null
            serviceGeneration += 1L
            capabilities = emptySet()
            lastError = "Shizuku binder unavailable"
            remoteLane.rotate()
        }
    }

    private val permissionResult = object : Shizuku.OnRequestPermissionResultListener {
        override fun onRequestPermissionResult(requestCode: Int, grantResult: Int) {
            if (deprovisionShutdown || requestCode != REQUEST_CODE) return
            if (grantResult == PackageManager.PERMISSION_GRANTED) {
                lastError = null
                bindNow()
            } else {
                lastError = "Shizuku permission not granted"
            }
        }
    }

    fun initialize(context: Context) {
        if (deprovisionShutdown || DeprovisionManager.isPostPurge(context)) return
        if (initialized) return
        synchronized(this) {
            if (initialized || deprovisionShutdown || DeprovisionManager.isPostPurge(context)) return
            appContext = context.applicationContext
            PrivilegedBridgeRuntime.install(ShizukuPrivilegedBridge)
            Shizuku.addBinderReceivedListenerSticky(binderReceived)
            Shizuku.addBinderDeadListener(binderDead)
            Shizuku.addRequestPermissionResultListener(permissionResult)
            initialized = true
        }
    }

    fun onAppForegroundChanged(isForeground: Boolean) {
        if (deprovisionShutdown) return
        // Remember a foreground event that precedes initialize(), without making Binder calls.
        foreground = isForeground
        if (isForeground && initialized) {
            if (hasPermission()) bindNow() else maybeRequestPermission()
        }
    }

    /**
     * Stops optional privileged state without affecting Brick Core. Used by permanent deprovision and
     * may also be called defensively after a provider fault. The user-service implements destroy(),
     * so remove=true asks Shizuku to terminate the remote process rather than leaving it orphaned.
     */
    /**
     * Final privacy fence, distinct from recoverable provider shutdown. Once this begins, late
     * Shizuku binder/permission callbacks must never reopen the purged brick preference store.
     * The lock serializes the only Shizuku callback preference write with the purge boundary.
     */
    fun shutdownForDeprovision() {
        synchronized(deprovisionFence) {
            deprovisionShutdown = true
            foreground = false
        }
        shutdown()
    }

    fun shutdown() {
        if (!initialized) return
        main.removeCallbacks(rebindRunnable)
        binding = false
        service = null
        serviceGeneration += 1L
        capabilities = emptySet()
        remoteLane.rotate()
        runCatching { Shizuku.unbindUserService(args(), connection, true) }
    }

    private fun binderAlive(): Boolean = initialized && !deprovisionShutdown &&
        runCatching { Shizuku.pingBinder() }.getOrDefault(false)

    private fun hasPermission(): Boolean = binderAlive() && runCatching {
        !Shizuku.isPreV11() && Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
    }.getOrDefault(false)

    private fun maybeRequestPermission() {
        if (deprovisionShutdown || !foreground || !binderAlive() || hasPermission()) return
        val rationale = runCatching { Shizuku.shouldShowRequestPermissionRationale() }.getOrDefault(true)
        if (rationale) return
        // Deprovision sets its in-process fence under the same lock before deleting preferences.
        // A late permission callback therefore cannot commit after this fence becomes active.
        val recorded = synchronized(deprovisionFence) {
            if (deprovisionShutdown) false
            else {
                val prefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)
                if (prefs.getBoolean("shizukuPermissionPrompted", false)) false
                else prefs.edit().putBoolean("shizukuPermissionPrompted", true).commit()
            }
        }
        if (!recorded || deprovisionShutdown) return
        runCatching { Shizuku.requestPermission(REQUEST_CODE) }
            .onFailure { noteError("Shizuku permission request failed") }
    }

    private fun args(): Shizuku.UserServiceArgs = Shizuku.UserServiceArgs(
        ComponentName(appContext, BrickShizukuUserService::class.java)
    )
        .processNameSuffix("brick_privileged")
        .daemon(false)
        .tag("brick-phase6")
        .version(1)

    private fun bindNow() {
        if (deprovisionShutdown || !initialized || service != null || binding || !hasPermission()) return
        binding = true
        runCatching { Shizuku.bindUserService(args(), connection) }
            .onFailure {
                binding = false
                noteError("Shizuku bind failed")
            }
    }

    private fun scheduleRebind() {
        if (deprovisionShutdown || !initialized || !binderAlive() || !hasPermission()) return
        main.removeCallbacks(rebindRunnable)
        main.postDelayed(rebindRunnable, REBIND_DELAY_MS)
    }

    private val rebindRunnable = Runnable { bindNow() }

    private fun refreshCapabilities() {
        if (deprovisionShutdown) return
        val current = service ?: return
        val generation = serviceGeneration
        val future = runCatching { remoteLane.submit { current.capabilities() } }.getOrElse {
            noteRemoteFailure(it, "Shizuku capability probe failed")
            return
        }
        val deadline = SystemClock.elapsedRealtime() + CALL_TIMEOUT_MS

        val poll = object : Runnable {
            override fun run() {
                if (deprovisionShutdown || generation != serviceGeneration || service !== current) {
                    future.cancel(true)
                    return
                }

                if (future.isDone) {
                    val result = runCatching { future.get(0L, TimeUnit.MILLISECONDS) }
                    result.onSuccess(::applyCapabilities)
                        .onFailure { error ->
                            val cause = if (error is ExecutionException) error.cause ?: error else error
                            noteRemoteFailure(cause, "Shizuku capability probe failed")
                        }
                    return
                }

                if (SystemClock.elapsedRealtime() >= deadline) {
                    future.cancel(true)
                    if (generation == serviceGeneration && service === current) {
                        lastError = "Shizuku capability probe timed out"
                        capabilities = emptySet()
                        service = null
                        serviceGeneration += 1L
                        // Do not let the stuck Binder invocation own the only execution lane used by
                        // future calls. Replace it first, then remove the bad remote service generation.
                        remoteLane.rotate()
                        runCatching { Shizuku.unbindUserService(args(), connection, true) }
                        scheduleRebind()
                    }
                    return
                }

                main.postDelayed(this, CAPABILITY_POLL_MS)
            }
        }
        main.post(poll)
    }

    private fun applyCapabilities(bundle: Bundle) {
        capabilities = buildSet {
            if (bundle.getBoolean("locationControl")) add(PrivilegedCapability.LOCATION_CONTROL)
            if (bundle.getBoolean("wifiEvidence")) add(PrivilegedCapability.WIFI_EVIDENCE)
            if (bundle.getBoolean("bleEvidence")) add(PrivilegedCapability.BLE_EVIDENCE)
            if (bundle.getBoolean("cellEvidence")) add(PrivilegedCapability.CELL_EVIDENCE)
            if (bundle.getBoolean("powerDiagnostics")) add(PrivilegedCapability.POWER_DIAGNOSTICS)
            if (bundle.getBoolean("powerRepair")) add(PrivilegedCapability.POWER_REPAIR)
            if (bundle.getBoolean("sosLocation")) add(PrivilegedCapability.SOS_LOCATION_ATTEMPT)
        }
        lastError = null
    }

    private fun noteError(message: String) {
        lastError = message.take(120)
    }

    private fun noteRemoteFailure(error: Throwable, message: String) {
        val cause = error.cause ?: error
        noteError(message)
        if (cause is DeadObjectException || cause is RemoteException) {
            service = null
            serviceGeneration += 1L
            capabilities = emptySet()
            remoteLane.rotate()
            scheduleRebind()
        }
    }

    private fun <T> remote(timeoutMs: Long = CALL_TIMEOUT_MS, action: (IBrickPrivilegedService) -> T): Result<T> {
        if (deprovisionShutdown) return Result.failure(IllegalStateException("Shizuku deprovisioned"))
        val current = service ?: return Result.failure(IllegalStateException("Shizuku user service unavailable"))
        val generation = serviceGeneration
        val result = remoteLane.call(timeoutMs) { action(current) }
        if (result.isSuccess) {
            // A late result from a retired binder must never enter wifi/ble/cell privacy handlers
            // after shutdown() or permanent deprovision invalidated its service generation.
            if (deprovisionShutdown || generation != serviceGeneration || service !== current) {
                return Result.failure(IllegalStateException("stale Shizuku service generation"))
            }
            lastError = null
            return result
        }

        val error = result.exceptionOrNull() ?: IllegalStateException("Shizuku operation failed")
        val cause = if (error is ExecutionException) error.cause ?: error else error
        if (cause is TimeoutException || error is TimeoutException) {
            noteError("Shizuku operation timed out")
            if (generation == serviceGeneration && service === current) {
                service = null
                serviceGeneration += 1L
                capabilities = emptySet()
                runCatching { Shizuku.unbindUserService(args(), connection, true) }
                scheduleRebind()
            }
        } else {
            noteRemoteFailure(cause, "Shizuku operation failed")
        }
        return Result.failure(cause)
    }

    fun health(): PrivilegedBridgeHealth = PrivilegedBridgeHealth(
        provider = "shizuku",
        available = binderAlive(),
        connected = service != null,
        permissionGranted = hasPermission(),
        capabilities = capabilities,
        lastError = lastError
    )

    fun setLocation(enabled: Boolean): Result<Boolean> = remote { it.setLocationEnabled(enabled) }

    private fun <T> guardPrivacyReduction(action: () -> T): T =
        synchronized(deprovisionFence) {
            check(!deprovisionShutdown) { "Shizuku is permanently quiesced" }
            action()
        }

    fun wifi(): Result<List<PrivilegedWifiEvidence>> = remote { it.wifiEvidence() }.mapCatching { bundle ->
        guardPrivacyReduction {
        requireSupported(bundle, "wifi")
        rows(bundle).mapNotNull { row ->
            val rawSsid = row.getString("ssid")?.takeIf { it.isNotBlank() }
            val rawBssid = row.getString("bssid")?.takeIf { it.isNotBlank() }
            if (rawSsid == null && rawBssid == null) return@mapNotNull null
            PrivilegedWifiEvidence(
                ssidHash = rawSsid?.let { AtlasPrivacyId.reduce("p6ssid", it) },
                bssidHash = rawBssid?.let { AtlasPrivacyId.reduce("p6bssid", it) },
                rssiDbm = row.getInt("rssi").takeIf { it in -127..0 },
                frequencyMhz = row.getInt("frequency").takeIf { it in 1..100_000 }
            )
        }.take(32)
        }
    }

    fun ble(): Result<List<PrivilegedBleEvidence>> = remote(BLE_CALL_TIMEOUT_MS) { it.bleEvidence() }.mapCatching { bundle ->
        guardPrivacyReduction {
        requireSupported(bundle, "ble")
        rows(bundle).mapNotNull { row ->
            val raw = row.getString("id")?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val rssi = row.getInt("rssi").takeIf { it in -127..20 } ?: return@mapNotNull null
            PrivilegedBleEvidence(AtlasPrivacyId.reduce("p6ble", raw), rssi)
        }.take(32)
        }
    }

    fun cell(): Result<List<PrivilegedCellEvidence>> = remote { it.cellEvidence() }.mapCatching { bundle ->
        guardPrivacyReduction {
        requireSupported(bundle, "cell")
        rows(bundle).mapNotNull { row ->
            val radio = row.getString("radio")?.lowercase()?.takeIf { it in setOf("nr", "lte", "wcdma", "gsm", "cdma") }
                ?: return@mapNotNull null
            val raw = row.getString("identity")?.takeIf { it.isNotBlank() }
            PrivilegedCellEvidence(
                radio = radio,
                identityHash = raw?.let { AtlasPrivacyId.reduce("p6cell", it) },
                signalDbm = row.getInt("dbm").takeIf { it in -160..0 }
            )
        }.take(32)
        }
    }

    fun powerDiagnostics(): Result<PrivilegedPowerDiagnostics> = remote { it.powerDiagnostics() }.mapCatching { bundle ->
        requireSupported(bundle, "power diagnostics")
        PrivilegedPowerDiagnostics(
            backgroundRestricted = bundle.getBoolean("backgroundRestricted").takeIf { bundle.containsKey("backgroundRestricted") },
            batteryOptimizationExempt = bundle.getBoolean("batteryOptimizationExempt").takeIf { bundle.containsKey("batteryOptimizationExempt") },
            detail = bundle.getString("detail")?.take(120)
        )
    }

    fun powerRepair(): Result<Boolean> = remote { it.requestPowerRepair() }
    fun sosLocation(): Result<Boolean> = remote { it.attemptSosLocationEnable() }

    private fun requireSupported(bundle: Bundle, family: String) {
        if (!bundle.getBoolean("supported", false)) {
            throw UnsupportedOperationException(bundle.getString("error")?.take(100) ?: "$family unavailable")
        }
    }

    @Suppress("DEPRECATION")
    private fun rows(bundle: Bundle): List<Bundle> = bundle.getParcelableArrayList<Bundle>("rows") ?: emptyList()
}

object ShizukuPrivilegedBridge : PrivilegedBridge {
    override fun health(): PrivilegedBridgeHealth = ShizukuBridgeController.health()
    override fun setParentLocationState(enabled: Boolean): Result<Boolean> = ShizukuBridgeController.setLocation(enabled)
    override fun wifiEvidence(): Result<List<PrivilegedWifiEvidence>> = ShizukuBridgeController.wifi()
    override fun bleEvidence(): Result<List<PrivilegedBleEvidence>> = ShizukuBridgeController.ble()
    override fun cellEvidence(): Result<List<PrivilegedCellEvidence>> = ShizukuBridgeController.cell()
    override fun powerDiagnostics(): Result<PrivilegedPowerDiagnostics> = ShizukuBridgeController.powerDiagnostics()
    override fun requestPowerRepair(): Result<Boolean> = ShizukuBridgeController.powerRepair()
    override fun attemptSosLocationEnable(): Result<Boolean> = ShizukuBridgeController.sosLocation()
}
