package com.brick.safety.reliability

import android.content.Context
import android.os.Process
import com.brick.safety.data.CrashOutbox
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.system.exitProcess

object CrashReporter {
    private val installed = AtomicBoolean(false)

    fun install(context: Context) {
        if (!installed.compareAndSet(false, true)) return
        val appContext = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            runCatching { persist(appContext, throwable) }
            if (previous != null) previous.uncaughtException(thread, throwable)
            else {
                Process.killProcess(Process.myPid())
                exitProcess(10)
            }
        }
    }

    private fun persist(context: Context, throwable: Throwable) {
        val frame = throwable.stackTrace.firstOrNull { it.className.startsWith("com.brick.safety.") }
        val module = moduleName(frame?.className)
        val signatureMaterial = listOf(
            throwable.javaClass.name,
            frame?.className ?: "unknown",
            frame?.methodName ?: "unknown"
        ).joinToString("|")
        val signature = MessageDigest.getInstance("SHA-256")
            .digest(signatureMaterial.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        val reportId = UUID.randomUUID().toString()
        val version = runCatching {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName
        }.getOrNull() ?: "unknown"
        val payload = JSONObject()
            .put("protocol", 1)
            .put("reportId", reportId)
            .put("appVersion", version)
            .put("module", module)
            .put("exceptionSignature", signature)
            .put("createdAtMs", System.currentTimeMillis())
            .toString()
            .toByteArray(Charsets.UTF_8)
        CrashOutbox(context).use { it.append(reportId, payload) }
    }

    private fun moduleName(className: String?): String {
        val raw = className
            ?.removePrefix("com.brick.safety.")
            ?.substringBeforeLast('.', "app")
            ?.ifBlank { "app" }
            ?: "app"
        return raw.replace(Regex("[^A-Za-z0-9_.-]"), "_").take(64)
    }
}
