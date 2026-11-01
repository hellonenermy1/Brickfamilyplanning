package com.brick.safety.witness

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey

/** Device-local secret used only to derive short-lived public BLE aliases. The secret never leaves Keystore. */
object WitnessAliasKey {
    private const val ALIAS = "brick-witness-alias-hmac-v1"
    const val SLOT_MS = 5L * 60L * 1_000L
    const val TOKEN_BYTES = 8

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build()
        )
        return generator.generateKey()
    }

    fun slotForWallTime(wallTimeMs: Long): Long {
        require(wallTimeMs > 0L)
        return wallTimeMs / SLOT_MS
    }

    fun token(deviceId: String, slot: Long): ByteArray {
        require(deviceId.matches(Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")))
        require(slot >= 0L)
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(key())
        mac.update("brick-witness-v1\u0000".toByteArray(StandardCharsets.UTF_8))
        mac.update(deviceId.toByteArray(StandardCharsets.US_ASCII))
        mac.update(0.toByte())
        mac.update(ByteBuffer.allocate(8).putLong(slot).array())
        return mac.doFinal().copyOf(TOKEN_BYTES)
    }

    fun tokenHex(deviceId: String, slot: Long): String = token(deviceId, slot).joinToString("") { "%02x".format(it.toInt() and 0xff) }
}
