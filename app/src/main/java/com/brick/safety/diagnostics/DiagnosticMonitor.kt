package com.brick.safety.diagnostics

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.PowerManager
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import com.brick.safety.activity.ActivityState
import com.brick.safety.data.Journal
import com.brick.safety.location.BrickLocationService
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.privileged.PrivilegedBridgeRuntime
import com.brick.safety.reliability.SafetyDispatcher
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

object DiagnosticMonitor {
    private val started = AtomicBoolean(false)
    private val scheduler = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "brick-6c-diagnostics").apply { isDaemon = true }
    }
    @Volatile private var future: ScheduledFuture<*>? = null
    private val last = LinkedHashMap<String, String>()
    private val drainMonitor = Object()
    private var activeSamples = 0

    @Synchronized
    fun start(context: Context) {
        val app = context.applicationContext
        // This is also an independently callable provider entry point. Application.onCreate's
        // post-purge guard is not sufficient when a late callback invokes start() directly.
        if (DeepOffManager.isActive(app)) return
        if (!started.compareAndSet(false, true)) return
        DiagnosticStore.init(app)
        DiagnosticStore.log(DiagnosticStore.Severity.INFO, "process", "process_started", "pid=${android.os.Process.myPid()}")
        future = scheduler.scheduleWithFixedDelay({
            if (started.get()) sample(app)
        }, 2, 15, TimeUnit.SECONDS)
    }

    /** Deep Off must stop process-local sampling immediately, not only future WorkManager jobs. */
    @Synchronized
    fun stop() {
        synchronized(drainMonitor) {
            if (!started.getAndSet(false)) return
            future?.cancel(false)
            future = null
        }
        synchronized(last) { last.clear() }
    }

    /** A cancelled scheduled future may still be writing. PURGE must await its actual exit. */
    fun awaitQuiescent(timeoutMs: Long): Boolean {
        require(timeoutMs in 1L..30_000L)
        synchronized(drainMonitor) {
            if (activeSamples == 0 && !started.get()) return true
            if (Looper.myLooper() == Looper.getMainLooper()) return false
            val deadline = SystemClock.elapsedRealtime() + timeoutMs
            while (activeSamples > 0 || started.get()) {
                val remaining = deadline - SystemClock.elapsedRealtime()
                if (remaining <= 0L) return false
                try { drainMonitor.wait(remaining) }
                catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    return false
                }
            }
            return true
        }
    }

    private fun sample(context: Context) {
        synchronized(drainMonitor) {
            if (!started.get()) return
            activeSamples++
        }
        try {
        runCatching {
            val brick = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
            val position = context.getSharedPreferences("brick_position", Context.MODE_PRIVATE)
            val state = context.getSharedPreferences("brick_diag_state", Context.MODE_PRIVATE)
            val am = context.getSystemService(ActivityManager::class.java)
            val power = context.getSystemService(PowerManager::class.java)
            val lm = context.getSystemService(LocationManager::class.java)
            val cm = context.getSystemService(ConnectivityManager::class.java)
            val active = cm.activeNetwork
            val caps = active?.let { cm.getNetworkCapabilities(it) }
            val network = when {
                caps == null -> "offline"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) -> "other"
                else -> "offline"
            }
            val validated = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
            @Suppress("DEPRECATION")
            val serviceRunning = runCatching {
                am.getRunningServices(100).any { it.service.className == BrickLocationService::class.java.name }
            }.getOrDefault(false)
            val locationEnabled = runCatching { lm.isLocationEnabled }.getOrDefault(false)
            val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            val background = Build.VERSION.SDK_INT < 29 || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
            val activity = ActivityState.read(context)
            val positionWall = position.getLong("anchorWallMs", 0L)
            val positionAgeMs = if (positionWall > 0L && System.currentTimeMillis() >= positionWall) System.currentTimeMillis() - positionWall else -1L
            val stale = brick.contains("deviceId") && locationEnabled && fine && (positionAgeMs < 0L || positionAgeMs > 120_000L)
            val privileged = runCatching { PrivilegedBridgeRuntime.current().health() }.getOrNull()
            val pending = runCatching { Journal(context).use { it.stats().pendingCount } }.getOrDefault(-1)
            val safetyPending = runCatching { SafetyDispatcher.pendingCount(context) }.getOrDefault(-1)
            val pendingBucket = when {
                pending <= 0 -> "0"
                pending <= 25 -> "1-25"
                pending <= 250 -> "26-250"
                pending <= 2_500 -> "251-2500"
                else -> "2500+"
            }
            val recoveryCount = brick.getInt("recoveryCount", 0)

            val values = linkedMapOf(
                "serviceRunning" to serviceRunning.toString(),
                "network" to "$network/${if (validated) "validated" else "unvalidated"}",
                "locationEnabled" to locationEnabled.toString(),
                "fineLocation" to fine.toString(),
                "backgroundLocation" to background.toString(),
                "powerSave" to power.isPowerSaveMode.toString(),
                "doze" to power.isDeviceIdleMode.toString(),
                "backgroundRestricted" to am.isBackgroundRestricted.toString(),
                "activity" to activity.mode.name.lowercase(),
                "positionStale" to stale.toString(),
                "journalPending" to pendingBucket,
                "safetyPending" to if (safetyPending <= 0) "0" else "nonzero",
                "recoveryCount" to recoveryCount.toString(),
                "shizuku" to "${privileged?.available ?: false}/${privileged?.connected ?: false}/${privileged?.permissionGranted ?: false}"
            )

            synchronized(last) {
                for ((key, value) in values) {
                    val previous = last.put(key, value)
                    if (previous == null) continue
                    if (previous == value) continue
                    val severity = when (key) {
                        "serviceRunning" -> if (value == "false" && brick.contains("deviceId")) DiagnosticStore.Severity.ERROR else DiagnosticStore.Severity.INFO
                        "fineLocation", "locationEnabled" -> if (value == "false" && brick.contains("deviceId")) DiagnosticStore.Severity.ERROR else DiagnosticStore.Severity.INFO
                        "positionStale" -> if (value == "true") DiagnosticStore.Severity.WARN else DiagnosticStore.Severity.INFO
                        "network", "powerSave", "doze", "backgroundRestricted", "journalPending", "safetyPending", "shizuku" -> DiagnosticStore.Severity.WARN
                        else -> DiagnosticStore.Severity.INFO
                    }
                    DiagnosticStore.log(severity, "monitor", "state_changed", "$key: $previous -> $value")
                }
            }

            if (!brick.getBoolean("journalWriteHealthy", true)) {
                oneShotFlag(context, "journal_unhealthy") {
                    DiagnosticStore.log(DiagnosticStore.Severity.ERROR, "storage", "journal_write_unhealthy", "core journal reported a write failure")
                }
            }
            if (!brick.getBoolean("safetyOutboxWriteHealthy", true)) {
                oneShotFlag(context, "safety_outbox_unhealthy") {
                    DiagnosticStore.log(DiagnosticStore.Severity.ERROR, "storage", "safety_outbox_unhealthy", "safety outbox reported a write failure")
                }
            }

            state.edit()
                .putLong("lastMonitorWallMs", System.currentTimeMillis())
                .putBoolean("serviceRunning", serviceRunning)
                .putString("network", network)
                .putBoolean("networkValidated", validated)
                .putBoolean("locationEnabled", locationEnabled)
                .putBoolean("fineLocation", fine)
                .putBoolean("backgroundLocation", background)
                .putBoolean("powerSave", power.isPowerSaveMode)
                .putBoolean("doze", power.isDeviceIdleMode)
                .putBoolean("backgroundRestricted", am.isBackgroundRestricted)
                .putBoolean("positionStale", stale)
                .putLong("positionAgeMs", positionAgeMs)
                .putInt("journalPending", pending)
                .putInt("safetyPending", safetyPending)
                .putString("activityMode", activity.mode.name.lowercase())
                .putInt("activityConfidence", activity.confidence)
                .putInt("recoveryCount", recoveryCount)
                .apply()
        }.onFailure {
            DiagnosticStore.log(DiagnosticStore.Severity.ERROR, "monitor", "sample_failed", it.javaClass.simpleName, it)
        }
        } finally {
            synchronized(drainMonitor) {
                activeSamples--
                drainMonitor.notifyAll()
            }
        }
    }

    private fun oneShotFlag(context: Context, key: String, action: () -> Unit) {
        val p = context.getSharedPreferences("brick_diag_flags", Context.MODE_PRIVATE)
        if (p.getBoolean(key, false)) return
        if (p.edit().putBoolean(key, true).commit()) action()
    }
}
