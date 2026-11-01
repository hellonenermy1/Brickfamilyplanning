package com.brick.safety.atlas

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey

/**
 * Stable per-install privacy identifiers for long-lived environmental models. Raw BSSID/MAC/device
 * identifiers are never used as Atlas keys. The HMAC key is non-exportable in Android Keystore.
 */
object AtlasPrivacyId {
    private const val KEYSTORE = "AndroidKeyStore"
    private const val ALIAS = "brick_atlas_hmac_v1"
    private const val OUTPUT_BYTES = 12

    @Synchronized
    fun reduce(namespace: String, raw: String): String {
        require(namespace.matches(Regex("[a-z0-9._-]{2,24}")))
        require(raw.isNotBlank() && raw.length <= 512)
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(key())
        val digest = mac.doFinal("$namespace\u0000$raw".toByteArray(Charsets.UTF_8))
        val hex = digest.take(OUTPUT_BYTES).joinToString("") { "%02x".format(it.toInt() and 0xff) }
        return "$namespace:$hex"
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build()
        )
        return generator.generateKey()
    }
}
