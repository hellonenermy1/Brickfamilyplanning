package com.brick.safety.privileged

import android.content.ComponentName
import android.content.Context
import android.content.ServiceConnection
import android.content.pm.PackageManager
import com.brick.safety.maintenance.DeprovisionManager
import com.brick.safety.testing.BrickInstrumentationTestCase
import rikka.shizuku.Shizuku
import java.io.File

/** P8C-008: delayed optional-provider callbacks must not recreate purged Brick preferences. */
class Phase8ShizukuDeprovisionFenceInstrumentedTest : BrickInstrumentationTestCase() {
    fun testLateShizukuCallbacksCannotRecreatePrefsAfterPermanentShutdown() {
        val app = instrumentation.targetContext.applicationContext

        // Set up the real controller, then remove its pre-existing optional runtime preferences.
        ShizukuBridgeController.initialize(app)
        assertTrue(app.deleteSharedPreferences("brick"))
        val brickXml = File(app.applicationInfo.dataDir, "shared_prefs/brick.xml")
        assertFalse(brickXml.exists())

        // Simulate the permanent purge boundary, without touching Device Owner on this emulator.
        ShizukuBridgeController.shutdownForDeprovision()
        assertTrue(app.getSharedPreferences("brick_deprovision_v1", Context.MODE_PRIVATE).edit()
            .putString("stage", DeprovisionManager.Stage.PURGE_BRICK.name)
            .putBoolean("deprovisionEverStarted", true)
            .commit())

        val controllerClass = ShizukuBridgeController::class.java
        fun field(name: String): Any {
            val f = controllerClass.getDeclaredField(name)
            f.isAccessible = true
            return f.get(ShizukuBridgeController)
        }

        // Deliver the original callbacks directly after the fence (the original crash/race window).
        (field("binderReceived") as Shizuku.OnBinderReceivedListener).onBinderReceived()
        (field("permissionResult") as Shizuku.OnRequestPermissionResultListener)
            .onRequestPermissionResult(6106, PackageManager.PERMISSION_GRANTED)
        (field("connection") as ServiceConnection)
            .onServiceConnected(ComponentName(app, BrickShizukuUserService::class.java), null)
        (field("connection") as ServiceConnection)
            .onServiceDisconnected(ComponentName(app, BrickShizukuUserService::class.java))
        ShizukuBridgeController.onAppForegroundChanged(true)
        ShizukuBridgeController.initialize(app)

        val health = ShizukuBridgeController.health()
        assertFalse(health.available)
        assertFalse(health.connected)
        assertFalse("late provider callback re-created brick preferences", brickXml.exists())
    }
}
