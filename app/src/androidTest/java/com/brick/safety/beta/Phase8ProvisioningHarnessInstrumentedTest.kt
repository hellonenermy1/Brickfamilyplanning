package com.brick.safety.beta

import android.app.admin.DevicePolicyManager
import androidx.test.platform.app.InstrumentationRegistry
import com.brick.safety.testing.BrickInstrumentationTestCase

/**
 * Emulator-only provisioning helper for the Phase 8 Device Owner lifecycle gate.
 *
 * Android 14+ caches whether accounts are incompatible with ADB Device Owner provisioning. AOSP
 * CTS explicitly recalculates that cache before owner-provisioning tests. Production Brick never
 * calls this hidden test API; this class is compiled only into the androidTest APK and runs only
 * when the dedicated workflow passes p8ProvisioningMode=sync.
 */
class Phase8ProvisioningHarnessInstrumentedTest : BrickInstrumentationTestCase() {
    fun testSynchronizeDevicePolicyProvisioningCaches() {
        val mode = InstrumentationRegistry.getArguments().getString("p8ProvisioningMode") ?: ""
        if (mode != "sync") return

        val dpm = instrumentation.targetContext.getSystemService(DevicePolicyManager::class.java)
        val uiAutomation = instrumentation.uiAutomation
        uiAutomation.adoptShellPermissionIdentity("android.permission.MANAGE_PROFILE_AND_DEVICE_OWNERS")
        try {
            // This is an Android @TestApi rather than part of the public SDK, so resolve it only in
            // androidTest. CTS uses the same API to refresh DevicePolicyManager's cached account
            // compatibility state before provisioning a test Device Owner.
            val refreshAccounts = DevicePolicyManager::class.java
                .getDeclaredMethod("calculateHasIncompatibleAccounts")
            refreshAccounts.isAccessible = true
            refreshAccounts.invoke(dpm)
        } finally {
            uiAutomation.dropShellPermissionIdentity()
        }
    }
}
