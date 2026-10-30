package com.brick.safety

import android.app.Application
import com.brick.safety.reliability.CrashReporter
import com.brick.safety.reliability.RecoveryScheduler

class BrickApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashReporter.install(this)
        RecoveryScheduler.ensureScheduled(this)
    }
}
