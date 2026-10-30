package com.brick.safety.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.SystemClock
import androidx.core.content.ContextCompat
import androidx.core.location.GnssStatusCompat
import androidx.core.location.LocationManagerCompat
import java.util.concurrent.Executor

class GnssQualityMonitor(private val context: Context) {
    companion object { private const val GNSS_STALE_MS = 30_000L }

    data class Snapshot(
        val totalSatellites: Int = 0,
        val usedInFix: Int = 0,
        val averageCn0DbHz: Float? = null,
        val updatedElapsedMs: Long = 0L
    )

    private val locationManager = context.getSystemService(LocationManager::class.java)
    @Volatile private var latest = Snapshot()
    private var registered = false

    private val callback = object : GnssStatusCompat.Callback() {
        override fun onSatelliteStatusChanged(status: GnssStatusCompat) {
            var used = 0
            var sum = 0f
            for (i in 0 until status.satelliteCount) {
                if (status.usedInFix(i)) {
                    used++
                    sum += status.getCn0DbHz(i)
                }
            }
            latest = Snapshot(
                totalSatellites = status.satelliteCount.coerceIn(0, 255),
                usedInFix = used.coerceIn(0, 255),
                averageCn0DbHz = if (used > 0) sum / used else null,
                updatedElapsedMs = SystemClock.elapsedRealtime()
            )
        }

        override fun onStopped() {
            latest = Snapshot()
        }
    }

    fun start(executor: Executor = ContextCompat.getMainExecutor(context)) {
        if (registered) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            latest = Snapshot()
            return
        }
        registered = runCatching {
            LocationManagerCompat.registerGnssStatusCallback(locationManager, executor, callback)
        }.getOrDefault(false)
        if (!registered) latest = Snapshot()
    }

    fun stop() {
        if (!registered) { latest = Snapshot(); return }
        runCatching { LocationManagerCompat.unregisterGnssStatusCallback(locationManager, callback) }
        registered = false
        latest = Snapshot()
    }

    fun snapshot(): Snapshot {
        val value = latest
        val now = SystemClock.elapsedRealtime()
        if (value.updatedElapsedMs <= 0L || value.updatedElapsedMs > now || now - value.updatedElapsedMs > GNSS_STALE_MS) return Snapshot()
        return value
    }
}
