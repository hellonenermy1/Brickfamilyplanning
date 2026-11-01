package com.brick.safety.atlas

import android.companion.AssociationInfo
import android.companion.CompanionDeviceManager
import android.companion.CompanionDeviceService
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.annotation.RequiresApi

/**
 * Presence state for devices explicitly associated with Brick through Android's Companion Device
 * Manager. Arbitrary nearby or merely bonded Bluetooth devices are never trusted here.
 *
 * Brick persists only an association id or a privacy-reduced legacy identifier. Raw MAC addresses
 * are never written to Brick storage.
 */
internal object CompanionPresenceStore {
    private const val PREFS = "brick_companion_presence"
    private const val ASSOCIATION_PREFIX = "association."
    private const val LEGACY_PREFIX = "legacy."

    @Synchronized
    fun noteAssociation(context: Context, associationId: Int, present: Boolean) {
        if (associationId < 0) return
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val key = "$ASSOCIATION_PREFIX$associationId"
        val edit = prefs.edit()
        if (present) edit.putBoolean(key, true) else edit.remove(key)
        edit.apply()
    }

    @Synchronized
    fun noteLegacyAddress(context: Context, rawAddress: String, present: Boolean) {
        val reduced = runCatching {
            AtlasPrivacyId.reduce("comp", "address:${rawAddress.trim().lowercase()}")
        }.getOrNull() ?: return
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val key = "$LEGACY_PREFIX$reduced"
        val edit = prefs.edit()
        if (present) edit.putBoolean(key, true) else edit.remove(key)
        edit.apply()
    }

    fun presentAssociationIds(context: Context): Set<Int> {
        val all = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).all
        return all.entries.mapNotNull { (key, value) ->
            if (!key.startsWith(ASSOCIATION_PREFIX) || value != true) return@mapNotNull null
            key.removePrefix(ASSOCIATION_PREFIX).toIntOrNull()?.takeIf { it >= 0 }
        }.toSet()
    }

    fun presentLegacyIds(context: Context): Set<String> {
        val all = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).all
        return all.entries.mapNotNull { (key, value) ->
            if (!key.startsWith(LEGACY_PREFIX) || value != true) return@mapNotNull null
            key.removePrefix(LEGACY_PREFIX).takeIf { it.matches(Regex("[A-Za-z0-9._:-]{6,96}")) }
        }.toSet()
    }

    @Synchronized
    fun retainAssociations(context: Context, validAssociationIds: Set<Int>, validLegacyIds: Set<String>) {
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val edit = prefs.edit()
        for (key in prefs.all.keys) {
            when {
                key.startsWith(ASSOCIATION_PREFIX) -> {
                    val id = key.removePrefix(ASSOCIATION_PREFIX).toIntOrNull()
                    if (id == null || id !in validAssociationIds) edit.remove(key)
                }
                key.startsWith(LEGACY_PREFIX) -> {
                    val id = key.removePrefix(LEGACY_PREFIX)
                    if (id !in validLegacyIds) edit.remove(key)
                }
            }
        }
        edit.apply()
    }
}

/** API 31-32 callback component. It never references API-33 AssociationInfo. */
@Suppress("DEPRECATION")
@RequiresApi(Build.VERSION_CODES.S)
class BrickCompanionLegacyService : CompanionDeviceService() {
    override fun onDeviceAppeared(address: String) {
        CompanionPresenceStore.noteLegacyAddress(this, address, true)
    }

    override fun onDeviceDisappeared(address: String) {
        CompanionPresenceStore.noteLegacyAddress(this, address, false)
    }
}

/** API 33+ callback component. Manifest resource gating keeps this class unloaded on API 31-32. */
@Suppress("DEPRECATION")
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class BrickCompanionAssociationService : CompanionDeviceService() {
    override fun onDeviceAppeared(associationInfo: AssociationInfo) {
        CompanionPresenceStore.noteAssociation(this, associationInfo.id, true)
    }

    override fun onDeviceDisappeared(associationInfo: AssociationInfo) {
        CompanionPresenceStore.noteAssociation(this, associationInfo.id, false)
    }
}

internal data class CompanionAssociationSnapshot(
    val associatedCount: Int,
    val presentSignalIds: List<String>,
    val capabilityDetail: String
)

private data class CompanionAssociationDescriptor(val id: Int, val address: String?)

/** Newer framework references stay isolated from the controller class loaded on older Android. */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
private object CompanionApi33 {
    fun associations(manager: CompanionDeviceManager): List<CompanionAssociationDescriptor> =
        manager.myAssociations.map { info ->
            CompanionAssociationDescriptor(info.id, info.deviceMacAddress?.toString())
        }
}

/**
 * Registers only existing CompanionDeviceManager associations for presence callbacks. Association
 * creation remains a deliberate setup action; this helper never silently trusts a nearby device.
 */
internal class CompanionPresenceController(context: Context) {
    private val appContext = context.applicationContext
    private val manager: CompanionDeviceManager? = if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        appContext.packageManager.hasSystemFeature(PackageManager.FEATURE_COMPANION_DEVICE_SETUP)
    ) appContext.getSystemService(CompanionDeviceManager::class.java) else null

    private val observedAddresses = linkedSetOf<String>()

    @Synchronized
    fun snapshotAndEnsureObserving(): CompanionAssociationSnapshot {
        val cdm = manager ?: return CompanionAssociationSnapshot(0, emptyList(), "companion_setup_unsupported")
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return CompanionAssociationSnapshot(0, emptyList(), "presence_api_unsupported")
        }

        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val associations = CompanionApi33.associations(cdm)
                val validIds = associations.mapTo(linkedSetOf()) { it.id }
                val addresses = associations.mapNotNull { it.address }
                addresses.forEach { address -> ensureLegacyObservation(cdm, address) }
                CompanionPresenceStore.retainAssociations(appContext, validIds, emptySet())
                val present = CompanionPresenceStore.presentAssociationIds(appContext)
                    .intersect(validIds)
                    .sorted()
                    .map { id -> AtlasPrivacyId.reduce("comp", "association:$id") }
                val detail = when {
                    associations.isEmpty() -> "no_companion_associations"
                    addresses.size < associations.size -> "associated_presence_limited"
                    else -> "associated_presence_enabled"
                }
                CompanionAssociationSnapshot(associations.size, present, detail)
            } else {
                @Suppress("DEPRECATION")
                val addresses = cdm.associations
                val validLegacy = addresses.mapNotNull { raw ->
                    runCatching { AtlasPrivacyId.reduce("comp", "address:${raw.trim().lowercase()}") }.getOrNull()
                }.toSet()
                addresses.forEach { address -> ensureLegacyObservation(cdm, address) }
                CompanionPresenceStore.retainAssociations(appContext, emptySet(), validLegacy)
                val present = CompanionPresenceStore.presentLegacyIds(appContext).intersect(validLegacy).sorted()
                CompanionAssociationSnapshot(
                    addresses.size,
                    present,
                    if (addresses.isEmpty()) "no_companion_associations" else "associated_presence_enabled_legacy"
                )
            }
        } catch (_: SecurityException) {
            CompanionAssociationSnapshot(0, emptyList(), "presence_permission_unavailable")
        } catch (_: Throwable) {
            CompanionAssociationSnapshot(0, emptyList(), "presence_temporarily_unavailable")
        }
    }

    @Suppress("DEPRECATION")
    private fun ensureLegacyObservation(cdm: CompanionDeviceManager, address: String) {
        if (!observedAddresses.add(address)) return
        runCatching { cdm.startObservingDevicePresence(address) }
            .onFailure { observedAddresses.remove(address) }
    }
}
