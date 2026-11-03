package com.brick.safety.reliability

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.core.content.ContextCompat
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.brick.safety.data.Journal
import com.brick.safety.diagnostics.DiagnosticStore
import com.brick.safety.maintenance.DeepOffManager
import com.brick.safety.maintenance.DeviceRoleStore
import com.brick.safety.network.CanaryApi
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

private object CanaryEngine {
    const val RETEST_WORK = "brick-daily-canary-retest"
    private const val PREFS = "brick_canary_v1"
    private const val RETEST_DELAY_MINUTES = 5L

    enum class Check(val wire: String) {
        SYSTEM_TRUTH("system_truth"),
        DURABLE_JOURNAL("durable_journal"),
        CLOUD_ROUND_TRIP("cloud_round_trip"),
        PROVIDERS("providers")
    }

    data class Outcome(val check: Check, val ok: Boolean, val detail: String)

    fun run(context: Context, only: Set<Check>? = null): List<Outcome> {
        val checks = Check.entries.filter { only == null || it in only }
        return checks.map { check ->
            runCatching {
                when (check) {
                    Check.SYSTEM_TRUTH -> systemTruth(context)
                    Check.DURABLE_JOURNAL -> journalRoundTrip(context)
                    Check.CLOUD_ROUND_TRIP -> cloudRoundTrip(context)
                    Check.PROVIDERS -> providerTruth(context)
                }
            }.getOrElse { Outcome(check, false, it.javaClass.simpleName + ":" + (it.message ?: "failed").take(100)) }
        }
    }

    fun persist(context: Context, outcomes: List<Outcome>, retest: Boolean) {
        val failed = outcomes.filterNot { it.ok }
        val resultArray = JSONArray()
        outcomes.forEach { resultArray.put(JSONObject().put("check", it.check.wire).put("ok", it.ok).put("detail", it.detail.take(120))) }
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit()
            .putLong(if (retest) "lastRetestAtMs" else "lastRunAtMs", System.currentTimeMillis())
            .putString(if (retest) "lastRetestResults" else "lastResults", resultArray.toString())
            .putString("lastFailed", JSONArray(failed.map { it.check.wire }).toString())
            .putBoolean("escalated", retest && failed.isNotEmpty())
            .commit()

        if (retest && failed.isNotEmpty()) {
            DiagnosticStore.log(context, DiagnosticStore.Severity.ERROR, "canary", "daily_canary_failed_after_retest", failed.joinToString(",") { it.check.wire })
        } else if (failed.isEmpty()) {
            DiagnosticStore.log(context, DiagnosticStore.Severity.INFO, "canary", if (retest) "daily_canary_retest_passed" else "daily_canary_passed")
        } else {
            DiagnosticStore.log(context, DiagnosticStore.Severity.WARN, "canary", "daily_canary_failed_first_pass", failed.joinToString(",") { it.check.wire })
        }
    }

    fun scheduleRetest(context: Context, failed: List<Outcome>) {
        val names = failed.filterNot { it.ok }.map { it.check.wire }.distinct().toTypedArray()
        if (names.isEmpty()) return
        val request = OneTimeWorkRequestBuilder<CanaryRetestWorker>()
            .setInputData(Data.Builder().putStringArray("checks", names).build())
            .setInitialDelay(RETEST_DELAY_MINUTES, TimeUnit.MINUTES)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(RETEST_WORK, ExistingWorkPolicy.REPLACE, request)
    }

    fun cancel(context: Context) = WorkManager.getInstance(context).cancelUniqueWork(RETEST_WORK)

    private fun systemTruth(context: Context): Outcome {
        if (DeviceRoleStore.role(context) != DeviceRoleStore.Role.CHILD) return Outcome(Check.SYSTEM_TRUTH, true, "non_child_role_not_applicable")
        if (DeepOffManager.isActive(context)) return Outcome(Check.SYSTEM_TRUTH, true, "deep_off_intentionally_quiesced")
        val lm = context.getSystemService(LocationManager::class.java)
        val locationReadable = runCatching { lm.isLocationEnabled }.isSuccess
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val health = HealthEvidence.collect(context)
        val sensorKeys = listOf("accelerometerAvailable", "gyroscopeAvailable", "rotationVectorAvailable", "stepCounterAvailable", "stepDetectorAvailable")
        val sensorTruthReadable = sensorKeys.all { health.has(it) && (health.opt(it) is Boolean) }
        val ok = locationReadable && fine && sensorTruthReadable
        return Outcome(Check.SYSTEM_TRUTH, ok, "locationReadable=$locationReadable fine=$fine sensorTruth=$sensorTruthReadable")
    }

    private fun journalRoundTrip(context: Context): Outcome {
        val nonce = UUID.randomUUID().toString()
        Journal(context).use { journal ->
            val db = journal.writableDatabase
            db.beginTransaction()
            try {
                db.execSQL("CREATE TEMP TABLE IF NOT EXISTS brick_canary(k TEXT PRIMARY KEY,v TEXT NOT NULL)")
                db.execSQL("DELETE FROM brick_canary")
                db.execSQL("INSERT INTO brick_canary(k,v) VALUES('nonce',?)", arrayOf(nonce))
                val read = db.rawQuery("SELECT v FROM brick_canary WHERE k='nonce'", emptyArray()).use { c -> if (c.moveToFirst()) c.getString(0) else null }
                if (read != nonce) return Outcome(Check.DURABLE_JOURNAL, false, "write_read_mismatch")
                val quick = db.rawQuery("PRAGMA quick_check", emptyArray()).use { c -> if (c.moveToFirst()) c.getString(0) else "missing" }
                if (quick.lowercase() != "ok") return Outcome(Check.DURABLE_JOURNAL, false, "quick_check=$quick")
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
        }
        return Outcome(Check.DURABLE_JOURNAL, true, "temp_write_read_and_quick_check_ok")
    }

    private fun cloudRoundTrip(context: Context): Outcome {
        val p = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val device = p.getString("deviceId", null) ?: return Outcome(Check.CLOUD_ROUND_TRIP, false, "not_paired")
        val base = p.getString("apiBase", null) ?: return Outcome(Check.CLOUD_ROUND_TRIP, false, "api_missing")
        val result = CanaryApi.roundTrip(base, device)
        return Outcome(Check.CLOUD_ROUND_TRIP, true, "echo_ok server=${result.serverReceivedAtMs}")
    }

    private fun providerTruth(context: Context): Outcome {
        val health = HealthEvidence.collect(context)
        val failures = mutableListOf<String>()
        val keys = health.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            if (!key.endsWith("ProviderCapability")) continue
            val capability = health.optString(key, "")
            val healthKey = key.removeSuffix("Capability") + "Health"
            val providerHealth = health.optString(healthKey, "")
            if (capability == "SUPPORTED" && providerHealth == "FAILED") failures += key.removeSuffix("ProviderCapability")
        }
        return Outcome(Check.PROVIDERS, failures.isEmpty(), if (failures.isEmpty()) "supported_providers_not_failed" else "failed=${failures.joinToString("|")}")
    }

    fun parseChecks(values: Array<String>?): Set<Check> = values.orEmpty().mapNotNull { name -> Check.entries.firstOrNull { it.wire == name } }.toSet()
}

class CanaryWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {
    override fun doWork(): Result {
        if (DeepOffManager.isActive(applicationContext) || DeviceRoleStore.role(applicationContext) != DeviceRoleStore.Role.CHILD) return Result.success()
        val outcomes = CanaryEngine.run(applicationContext)
        CanaryEngine.persist(applicationContext, outcomes, retest = false)
        val failed = outcomes.filterNot { it.ok }
        if (failed.isNotEmpty()) CanaryEngine.scheduleRetest(applicationContext, failed) else CanaryEngine.cancel(applicationContext)
        return Result.success()
    }
}

class CanaryRetestWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {
    override fun doWork(): Result {
        if (DeepOffManager.isActive(applicationContext) || DeviceRoleStore.role(applicationContext) != DeviceRoleStore.Role.CHILD) return Result.success()
        val checks = CanaryEngine.parseChecks(inputData.getStringArray("checks"))
        if (checks.isEmpty()) return Result.success()
        val outcomes = CanaryEngine.run(applicationContext, checks)
        CanaryEngine.persist(applicationContext, outcomes, retest = true)
        return Result.success()
    }
}
