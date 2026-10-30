package com.brick.safety.crypto

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.util.Base64

object DeviceKeys {
    private const val ALIAS = "brick-device-signing-v1"
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun getOrCreate(): KeyPair {
        val cert = keyStore.getCertificate(ALIAS)
        val privateKey = keyStore.getKey(ALIAS, null) as? java.security.PrivateKey
        if (cert != null && privateKey != null) return KeyPair(cert.publicKey, privateKey)

        val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
        generator.initialize(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                .setAlgorithmParameterSpec(java.security.spec.ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build()
        )
        return generator.generateKeyPair()
    }

    fun publicSpkiBase64(): String = Base64.getEncoder().encodeToString(getOrCreate().public.encoded)

    fun sign(payload: ByteArray): String {
        val signature = Signature.getInstance("SHA256withECDSA")
        signature.initSign(getOrCreate().private)
        signature.update(payload)
        return Base64.getEncoder().encodeToString(signature.sign())
    }
}
