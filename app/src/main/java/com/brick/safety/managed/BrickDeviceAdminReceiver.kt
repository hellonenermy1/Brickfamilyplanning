package com.brick.safety.managed

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import com.brick.safety.maintenance.PolicyLedger

class BrickDeviceAdminReceiver : DeviceAdminReceiver() {
    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        // This callback is the managed-lifecycle creation boundary. Establish an explicit durable
        // empty provenance ledger before Brick is allowed to make any Device Owner policy mutation.
        // If this write fails, ManagedPolicy will fail closed because it requires ledger readiness.
        PolicyLedger.initializeManagedLifecycle(context.applicationContext)
    }
}
