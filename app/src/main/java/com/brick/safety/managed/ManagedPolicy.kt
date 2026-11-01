package com.brick.safety.managed

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.UserManager
import com.brick.safety.privileged.PrivilegedBridgeRuntime
import java.util.concurrent.atomic.AtomicBoolean

object ManagedPolicy {
    private const val RECONCILE_RETRY_MS = 15_000L
    private val mainHandler = Handler(Looper.getMainLooper())
    private val reconcileScheduled = AtomicBoolean(false)
    @Volatile private var reconcileContext: Context? = null

    private val reconcileRunnable = Runnable {
        reconcileScheduled.set(false)
        reconcileContext?.let { context -> runCatching { apply(context) } }
    }

    fun isDeviceOwner(context: Context): Boolean {
        val dpm = context.getSystemService(DevicePolicyManager::class.java)
        return runCatching { dpm.isDeviceOwnerApp(context.packageName) }.getOrDefault(false)
    }

    private fun scheduleReconcile(context: Context) {
        reconcileContext = context.applicationContext
        if (reconcileScheduled.compareAndSet(false, true)) {
            mainHandler.postDelayed(reconcileRunnable, RECONCILE_RETRY_MS)
        }
    }

    private fun clearReconcile() {
        reconcileContext = null
        if (reconcileScheduled.getAndSet(false)) {
            mainHandler.removeCallbacks(reconcileRunnable)
        }
    }

    /**
     * Device Owner is always the first control path. If the OEM accepts the call but the actual
     * Android Location state still does not match the authenticated parent request, Phase 6 may use
     * the optional typed privileged bridge as a fallback. A remaining mismatch is retried every
     * 15 seconds while this process is alive, so a temporary Shizuku outage/permission transition
     * can self-heal without waiting for another parent command or manual restart.
     *
     * The return value intentionally preserves the pre-Phase-6 meaning: true only when Brick is
     * Device Owner. Actual desired-vs-observed Location state is reported separately in health.
     */
    @Suppress("DEPRECATION")
    fun apply(context: Context): Boolean {
        val appContext = context.applicationContext
        val dpm = appContext.getSystemService(DevicePolicyManager::class.java)
        val owner = runCatching { dpm.isDeviceOwnerApp(appContext.packageName) }.getOrDefault(false)
        val admin = ComponentName(appContext, BrickDeviceAdminReceiver::class.java)

        if (owner) {
            val permissions = mutableListOf(
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION,
                Manifest.permission.ACTIVITY_RECOGNITION
            )
            if (Build.VERSION.SDK_INT >= 31) permissions += Manifest.permission.BLUETOOTH_SCAN
            if (Build.VERSION.SDK_INT >= 33) {
                permissions += Manifest.permission.NEARBY_WIFI_DEVICES
                permissions += Manifest.permission.POST_NOTIFICATIONS
            }

            permissions.forEach { permission ->
                runCatching {
                    dpm.setPermissionGrantState(
                        admin,
                        appContext.packageName,
                        permission,
                        DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED
                    )
                }
            }

            // Wrong wall time can make signed/replay-protected traffic look stale or future-dated.
            // Each policy remains isolated so an OEM-specific failure cannot stop Brick Core.
            if (Build.VERSION.SDK_INT >= 30) {
                runCatching { dpm.setAutoTimeEnabled(admin, true) }
                runCatching { dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_DATE_TIME) }
            } else {
                runCatching { dpm.setAutoTimeRequired(admin, true) }
            }
        }

        val desiredOn = ParentLocationStateStore.read(appContext).desired == DesiredLocationState.ON
        if (owner && Build.VERSION.SDK_INT >= 30) {
            runCatching { dpm.setLocationEnabled(admin, desiredOn) }
            runCatching { dpm.addUserRestriction(admin, UserManager.DISALLOW_CONFIG_LOCATION) }
        }

        // Never assume a policy call worked. Verify the real system state, use Shizuku only as a
        // bounded fallback when needed, then verify again. Any remaining mismatch is retried later.
        val locationManager = appContext.getSystemService(LocationManager::class.java)
        val before = runCatching { locationManager.isLocationEnabled }.getOrNull()
        if (before != null && before != desiredOn) {
            runCatching {
                PrivilegedBridgeRuntime.current().setParentLocationState(desiredOn).getOrDefault(false)
            }
        }

        val after = runCatching { locationManager.isLocationEnabled }.getOrNull()
        if (after == desiredOn) clearReconcile() else scheduleReconcile(appContext)
        return owner
    }
}
