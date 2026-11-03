package com.brick.safety.atlas

import android.companion.AssociationInfo
import android.companion.CompanionDeviceManager
import android.companion.CompanionDeviceService
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.annotation.RequiresApi
import com.brick.safety.maintenance.DeprovisionManager

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
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app) || associationId < 0) return
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val key = "$ASSOCIATION_PREFIX$associationId"
        val edit = prefs.edit()
        if (present) edit.putBoolean(key, true) else edit.remove(key)
        edit.apply()
    }

    @Synchronized
    fun noteLegacyAddress(context: Context, rawAddress: String, present: Boolean) {
        val app = context.applicationContext
        // Check before AtlasPrivacyId.reduce(); otherwise a late system callback could recreate the
        // purged Atlas HMAC key even if we later refused to write the preference.
        if (DeprovisionManager.isPostPurge(app)) return
        val reduced = runCatching {
            AtlasPrivacyId.reduce("comp", "address:${rawAddress.trim().lowercase()}")
        }.getOrNull() ?: return
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val key = "$LEGACY_PREFIX$reduced"
        val edit = prefs.edit()
        if (present) edit.putBoolean(key, true) else edit.remove(key)
        edit.apply()
    }

    fun presentAssociationIds(context: Context): Set<Int> {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return emptySet()
        val all = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).all
        return all.entries.mapNotNull { (key, value) ->
            if (!key.startsWith(ASSOCIATION_PREFIX) || value != true) return@mapNotNull null
            key.removePrefix(ASSOCIATION_PREFIX).toIntOrNull()?.takeIf { it >= 0 }
        }.toSet()
    }

    fun presentLegacyIds(context: Context): Set<String> {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return emptySet()
        val all = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).all
        return all.entries.mapNotNull { (key, value) ->
            if (!key.startsWith(LEGACY_PREFIX) || value != true) return@mapNotNull null
            key.removePrefix(LEGACY_PREFIX).takeIf { it.matches(Regex("[A-Za-z0-9._:-]{6,96}")) }
        }.toSet()
    }

    @Synchronized
    fun retainAssociations(context: Context, validAssociationIds: Set<Int>, validLegacyIds: Set<String>) {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
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

    /** Presence is ephemeral. Associations survive reboot; a previous-boot 'present' bit must not. */
    @Synchronized
    fun clearPresence(context: Context) {
        val app = context.applicationContext
        if (DeprovisionManager.isPostPurge(app)) return
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }
}

/**
 * Process-local bookkeeping for presence subscriptions. Android owns the durable association; this
 * registry only prevents duplicate startObserving calls while that association remains current.
 * If an association disappears, its entry is forgotten so re-associating the same device can
 * register presence again without requiring a Brick process restart.
 */
internal class CompanionObservationRegistry {
    private val observedAddresses = linkedSetOf<String>()

    @Synchronized
    fun reconcile(validAddresses: Set<String>) {
        observedAddresses.retainAll(validAddresses)
    }

    @Synchronized
    fun markStartRequested(address: String): Boolean = observedAddresses.add(address)

    @Synchronized
    fun markStartFailed(address: String) {
        observedAddresses.remove(address)
    }
}

/** API 31-32 callback component. It never references API-33 AssociationInfo. */
@Suppress("DEPRECATION")
@RequiresApi(Build.VERSION_CODES.S)
class BrickCompanionLegacyService : CompanionDeviceService() {
    override fun onDeviceAppeared(address: String) {
        if (DeprovisionManager.isPostPurge(this)) return
        CompanionPresenceStore.noteLegacyAddress(this, address, true)
    }

    override fun onDeviceDisappeared(address: String) {
        if (DeprovisionManager.isPostPurge(this)) return
        CompanionPresenceStore.noteLegacyAddress(this, address, false)
    }
}

/** API 33+ callback component. Manifest resource gating keeps this class unloaded on API 31-32. */
@Suppress("DEPRECATION")
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class BrickCompanionAssociationService : CompanionDeviceService() {
    override fun onDeviceAppeared(associationInfo: AssociationInfo) {
        if (DeprovisionManager.isPostPurge(this)) return
        CompanionPresenceStore.noteAssociation(this, associationInfo.id, true)
    }

    override fun onDeviceDisappeared(associationInfo: AssociationInfo) {
        if (DeprovisionManager.isPostPurge(this)) return
        CompanionPresenceStore.noteAssociation(this, associationInfo.id, false)
    }
}

internal data class CompanionAssociationSnapshot(
    val associatedCount: Int,
    val presentSignalIds: List<String>,
    val capabilityDetail: String
)

private data class CompanionAssociationDescriptor(val id: Int, val address: String?)

/** API-31-only method references stay outside the controller loaded on API 29-30. */
@RequiresApi(Build.VERSION_CODES.S)
private object CompanionApi31 {
    @Suppress("DEPRECATION")
    fun startObserving(manager: CompanionDeviceManager, address: String) {
        manager.startObservingDevicePresence(address)
    }
}

/** API-33-only framework references stay outside the controller loaded on older Android. */
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

    private val observationRegistry = CompanionObservationRegistry()

    @Synchronized
    fun snapshotAndEnsureObserving(): CompanionAssociationSnapshot {
        if (DeprovisionManager.isPostPurge(appContext)) {
            return CompanionAssociationSnapshot(0, emptyList(), "deprovisioned")
        }
        val cdm = manager ?: return CompanionAssociationSnapshot(0, emptyList(), "companion_setup_unsupported")
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return CompanionAssociationSnapshot(0, emptyList(), "presence_api_unsupported")
        }

        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val associations = CompanionApi33.associations(cdm)
                val validIds = associations.mapTo(linkedSetOf()) { it.id }
                val addresses = associations.mapNotNull { it.address }
                reconcileAndEnsureObservation(cdm, addresses)
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
                reconcileAndEnsureObservation(cdm, addresses)
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

    @RequiresApi(Build.VERSION_CODES.S)
    private fun reconcileAndEnsureObservation(cdm: CompanionDeviceManager, addresses: Collection<String>) {
        val validAddresses = addresses.toSet()
        observationRegistry.reconcile(validAddresses)
        validAddresses.forEach { address -> ensureObservation(cdm, address) }
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun ensureObservation(cdm: CompanionDeviceManager, address: String) {
        if (!observationRegistry.markStartRequested(address)) return
        runCatching { CompanionApi31.startObserving(cdm, address) }
            .onFailure { observationRegistry.markStartFailed(address) }
    }
}
