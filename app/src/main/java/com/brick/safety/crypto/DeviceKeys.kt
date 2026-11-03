package com.brick.safety.crypto

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.Signature
import java.util.Base64

object DeviceKeys {
    private const val ALIAS = "brick-device-signing-v1"
    private const val PREF_EXPECTED_FINGERPRINT = "pairedSigningKeySha256"
    private const val PREF_IDENTITY_FAULT = "signingIdentityFault"
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    @Volatile private var appContext: Context? = null

    /** Must be called from Application startup before normal signed traffic begins. */
    fun initialize(context: Context) {
        appContext = context.applicationContext
        runCatching { validateExistingPairedIdentity() }
    }

    fun getOrCreate(): KeyPair {
        val existing = existingKeyPair()
        if (existing != null) {
            validatePairedKey(existing)
            return existing
        }

        if (isPaired()) {
            recordIdentityFault("paired_signing_key_missing")
            throw IllegalStateException("Paired Brick signing key is missing; authorised re-enrollment is required")
        }

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
        val pair = getOrCreate()
        val signature = Signature.getInstance("SHA256withECDSA")
        signature.initSign(pair.private)
        signature.update(payload)
        return Base64.getEncoder().encodeToString(signature.sign())
    }

    fun identityFault(context: Context): String? = context.applicationContext
        .getSharedPreferences("brick", Context.MODE_PRIVATE)
        .getString(PREF_IDENTITY_FAULT, null)
        ?.takeIf { it.isNotBlank() }

    /** Used only by an explicit authorised re-provision/deprovision flow. */
    fun clearIdentityBinding(context: Context): Boolean = context.applicationContext
        .getSharedPreferences("brick", Context.MODE_PRIVATE)
        .edit()
        .remove(PREF_EXPECTED_FINGERPRINT)
        .remove(PREF_IDENTITY_FAULT)
        .commit()

    private fun existingKeyPair(): KeyPair? {
        val cert = keyStore.getCertificate(ALIAS) ?: return null
        val privateKey = keyStore.getKey(ALIAS, null) as? java.security.PrivateKey ?: return null
        return KeyPair(cert.publicKey, privateKey)
    }

    private fun isPaired(): Boolean = appContext
        ?.getSharedPreferences("brick", Context.MODE_PRIVATE)
        ?.contains("deviceId") == true

    private fun validateExistingPairedIdentity() {
        if (!isPaired()) return
        val existing = existingKeyPair()
        if (existing == null) {
            recordIdentityFault("paired_signing_key_missing")
            return
        }
        validatePairedKey(existing)
    }

    private fun validatePairedKey(pair: KeyPair) {
        if (!isPaired()) return
        val context = appContext ?: return
        val prefs = context.getSharedPreferences("brick", Context.MODE_PRIVATE)
        val actual = fingerprint(pair.public.encoded)
        val expected = prefs.getString(PREF_EXPECTED_FINGERPRINT, null)
        if (expected.isNullOrBlank()) {
            // One-time migration for already-paired installs whose original key is still present.
            if (!prefs.edit().putString(PREF_EXPECTED_FINGERPRINT, actual).remove(PREF_IDENTITY_FAULT).commit()) {
                throw IllegalStateException("Unable to persist paired signing-key fingerprint")
            }
            return
        }
        if (!MessageDigest.isEqual(expected.toByteArray(Charsets.US_ASCII), actual.toByteArray(Charsets.US_ASCII))) {
            recordIdentityFault("paired_signing_key_mismatch")
            throw SecurityException("Brick signing identity mismatch; authorised re-enrollment is required")
        }
        if (prefs.contains(PREF_IDENTITY_FAULT)) prefs.edit().remove(PREF_IDENTITY_FAULT).commit()
    }

    private fun recordIdentityFault(reason: String) {
        appContext?.getSharedPreferences("brick", Context.MODE_PRIVATE)?.edit()
            ?.putString(PREF_IDENTITY_FAULT, reason.take(80))
            ?.putLong("signingIdentityFaultWallMs", System.currentTimeMillis())
            ?.commit()
    }

    private fun fingerprint(spki: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(spki)
        .joinToString("") { "%02x".format(it.toInt() and 0xff) }
}
