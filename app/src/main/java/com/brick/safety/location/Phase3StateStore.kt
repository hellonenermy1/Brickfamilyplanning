package com.brick.safety.location

import android.content.Context
import android.util.AtomicFile
import com.brick.safety.crypto.JournalCipher
import org.json.JSONObject
import java.io.File

internal data class Phase3PersistedState(
    val odometry: String,
    val routeGraph: String,
    val magnetic: String,
    val landmarks: String,
    val particles: String,
    val lastMotionStepTotal: Long,
    val lastMapRefreshWallMs: Long,
    val lastMapLatBits: Long,
    val lastMapLonBits: Long
)

/** Encrypted, atomic local state for learned routes and positioning models. */
internal class Phase3StateStore(context: Context) {
    companion object {
        private const val VERSION = 1
        private const val MAX_STATE_BYTES = 768 * 1024
    }

    private val appContext = context.applicationContext
    private val atomic = AtomicFile(File(appContext.filesDir, "brick_phase3_state.bin"))
    private val healthPrefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)

    fun read(): Phase3PersistedState? {
        if (!atomic.baseFile.exists()) return null
        return try {
            val encrypted = atomic.readFully()
            require(encrypted.size in 13..MAX_STATE_BYTES) { "Phase 3 state outside size bound" }
            val plain = JournalCipher.decrypt(encrypted)
            require(plain.size <= MAX_STATE_BYTES) { "Phase 3 plaintext outside size bound" }
            val json = JSONObject(plain.toString(Charsets.UTF_8))
            require(json.getInt("version") == VERSION) { "Unsupported Phase 3 state version" }
            val state = Phase3PersistedState(
                odometry = json.optString("odometry", ""),
                routeGraph = json.optString("routeGraph", ""),
                magnetic = json.optString("magnetic", ""),
                landmarks = json.optString("landmarks", ""),
                particles = json.optString("particles", ""),
                lastMotionStepTotal = json.optLong("lastMotionStepTotal", 0L).coerceAtLeast(0L),
                lastMapRefreshWallMs = json.optLong("lastMapRefreshWallMs", 0L).coerceAtLeast(0L),
                lastMapLatBits = json.optLong("lastMapLatBits", 0L),
                lastMapLonBits = json.optLong("lastMapLonBits", 0L)
            )
            markHealthy()
            state
        } catch (_: Throwable) {
            markFailure()
            runCatching { atomic.delete() }
            null
        }
    }

    fun write(state: Phase3PersistedState): Boolean {
        return try {
            val plain = JSONObject()
                .put("version", VERSION)
                .put("odometry", state.odometry)
                .put("routeGraph", state.routeGraph)
                .put("magnetic", state.magnetic)
                .put("landmarks", state.landmarks)
                .put("particles", state.particles)
                .put("lastMotionStepTotal", state.lastMotionStepTotal)
                .put("lastMapRefreshWallMs", state.lastMapRefreshWallMs)
                .put("lastMapLatBits", state.lastMapLatBits)
                .put("lastMapLonBits", state.lastMapLonBits)
                .toString().toByteArray(Charsets.UTF_8)
            require(plain.size <= MAX_STATE_BYTES) { "Phase 3 state too large" }
            val encrypted = JournalCipher.encrypt(plain)
            require(encrypted.size <= MAX_STATE_BYTES) { "Phase 3 encrypted state too large" }
            val stream = atomic.startWrite()
            try {
                stream.write(encrypted)
                stream.fd.sync()
                atomic.finishWrite(stream)
            } catch (error: Throwable) {
                atomic.failWrite(stream)
                throw error
            }
            markHealthy()
            true
        } catch (_: Throwable) {
            markFailure()
            false
        }
    }

    private fun markHealthy() {
        healthPrefs.edit().putBoolean("phase3StateHealthy", true).apply()
    }

    private fun markFailure() {
        val current = healthPrefs.getLong("phase3StateFailureTotal", 0L).coerceAtLeast(0L)
        healthPrefs.edit()
            .putBoolean("phase3StateHealthy", false)
            .putLong("lastPhase3StateFailureWallMs", System.currentTimeMillis())
            .putLong("phase3StateFailureTotal", current + 1L)
            .apply()
    }
}
