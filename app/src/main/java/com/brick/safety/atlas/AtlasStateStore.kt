package com.brick.safety.atlas

import android.content.Context
import android.util.AtomicFile
import com.brick.safety.crypto.JournalCipher
import java.io.File

internal class AtlasStateStore(context: Context) {
    companion object {
        private const val MAX_PLAINTEXT_BYTES = 1_500_000
        private const val MAX_ENCRYPTED_BYTES = 1_600_000
    }

    private val appContext = context.applicationContext
    private val atomic = AtomicFile(File(appContext.filesDir, "brick_atlas_v1.bin"))
    private val prefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)

    fun restoreInto(atlas: EnvironmentalAtlas, nowWallMs: Long = System.currentTimeMillis()): Boolean {
        if (!atomic.baseFile.exists()) {
            markHealthy()
            return true
        }
        return try {
            val encrypted = atomic.readFully()
            require(encrypted.size in 13..MAX_ENCRYPTED_BYTES) { "Atlas state outside encrypted bound" }
            val plain = JournalCipher.decrypt(encrypted)
            require(plain.size <= MAX_PLAINTEXT_BYTES) { "Atlas state outside plaintext bound" }
            val restored = atlas.restore(plain.toString(Charsets.UTF_8), nowWallMs)
            require(restored) { "Atlas state codec rejected content" }
            markHealthy()
            true
        } catch (_: Throwable) {
            markFailure()
            runCatching { atomic.delete() }
            false
        }
    }

    fun write(atlas: EnvironmentalAtlas, nowWallMs: Long = System.currentTimeMillis()): Boolean {
        return try {
            val plain = atlas.encode(nowWallMs).toByteArray(Charsets.UTF_8)
            require(plain.size <= MAX_PLAINTEXT_BYTES) { "Atlas state outside plaintext bound" }
            val encrypted = JournalCipher.encrypt(plain)
            require(encrypted.size <= MAX_ENCRYPTED_BYTES) { "Atlas state outside encrypted bound" }
            val output = atomic.startWrite()
            try {
                output.write(encrypted)
                output.fd.sync()
                atomic.finishWrite(output)
            } catch (error: Throwable) {
                atomic.failWrite(output)
                throw error
            }
            prefs.edit()
                .putInt("atlasLabelCount", atlas.labelCount())
                .putInt("atlasSignalCount", atlas.signalCount())
                .putLong("lastAtlasPersistWallMs", nowWallMs)
                .apply()
            markHealthy()
            true
        } catch (_: Throwable) {
            markFailure()
            false
        }
    }

    private fun markHealthy() {
        prefs.edit().putBoolean("atlasStateHealthy", true).apply()
    }

    private fun markFailure() {
        val old = prefs.getLong("atlasStateFailureTotal", 0L).coerceAtLeast(0L)
        prefs.edit()
            .putBoolean("atlasStateHealthy", false)
            .putLong("atlasStateFailureTotal", if (old == Long.MAX_VALUE) old else old + 1L)
            .putLong("lastAtlasStateFailureWallMs", System.currentTimeMillis())
            .apply()
    }
}
