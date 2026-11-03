package com.brick.safety.beta

import android.app.admin.DevicePolicyManager
import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import com.brick.safety.testing.BrickInstrumentationTestCase

/**
 * Emulator-only provisioning helper for the Phase 8 Device Owner lifecycle gate.
 *
 * Android 14+ caches whether accounts are incompatible with ADB Device Owner provisioning, and
 * DevicePolicyManager also deliberately treats USER_SETUP_COMPLETE as monotonic during ordinary
 * runtime. AOSP CTS refreshes those two test-only states before provisioning. The production Brick
 * app never calls these hidden APIs; this class is compiled only into the androidTest APK and runs
 * only when the dedicated workflow passes p8ProvisioningMode=sync.
 */
class Phase8ProvisioningHarnessInstrumentedTest : BrickInstrumentationTestCase() {
    fun testSynchronizeDevicePolicyProvisioningCaches() {
        val mode = InstrumentationRegistry.getArguments().getString("p8ProvisioningMode") ?: ""
        if (mode != "sync") return

        val dpm = instrumentation.targetContext.getSystemService(DevicePolicyManager::class.java)
        val uiAutomation = instrumentation.uiAutomation
        uiAutomation.adoptShellPermissionIdentity("android.permission.MANAGE_PROFILE_AND_DEVICE_OWNERS")
        try {
            // Android 15 exposes the no-arg test API; newer branches may carry the user-id overload.
            // Resolve reflectively so the production compile SDK never gains a hidden-API dependency.
            val forceSetup = DevicePolicyManager::class.java.declaredMethods.firstOrNull {
                it.name == "forceUpdateUserSetupComplete" && (it.parameterCount == 0 || it.parameterCount == 1)
            } ?: error("DevicePolicyManager forceUpdateUserSetupComplete test API is unavailable")
            forceSetup.isAccessible = true
            if (forceSetup.parameterCount == 0) {
                forceSetup.invoke(dpm)
            } else {
                forceSetup.invoke(dpm, 0)
            }

            val refreshAccounts = DevicePolicyManager::class.java.getDeclaredMethod("calculateHasIncompatibleAccounts")
            refreshAccounts.isAccessible = true
            refreshAccounts.invoke(dpm)
        } finally {
            uiAutomation.dropShellPermissionIdentity()
        }
    }
}
