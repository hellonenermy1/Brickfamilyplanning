package com.brick.safety.atlas

import android.companion.AssociationInfo
import android.companion.CompanionDeviceManager
import android.companion.CompanionDeviceService
import android.companion.DevicePresenceEvent
import android.companion.ObservingDevicePresenceRequest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/**
 * Presence state for devices explicitly associated with Brick through Android's Companion Device
 * Manager. Arbitrary nearby or merely bonded Bluetooth devices are never trusted here.
 *
 * The store keeps only a privacy-reduced identifier / association id and a small presence bitmask.
 * No raw MAC address is persisted by Brick.
 */
internal object CompanionPresenceStore {
    private const val PREFS = "brick_companion_presence"
    private const val ASSOCIATION_PREFIX = "association."
    private const val LEGACY_PREFIX = "legacy."
    private const val BIT_BLE = 1
    private const val BIT_BT = 1 shl 1
    private const val BIT_SELF = 1 shl 2
    private const val BIT_LEGACY = 1 shl 3

    @Synchronized
    fun noteAssociation(context: Context, associationId: Int, event: Int) {
        if (associationId < 0) return
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val key = "$ASSOCIATION_PREFIX$associationId"
        val old = prefs.getInt(key, 0)
        val updated = when (event) {
            DevicePresenceEvent.EVENT_BLE_APPEARED -> old or BIT_BLE
            DevicePresenceEvent.EVENT_BLE_DISAPPEARED -> old and BIT_BLE.inv()
            DevicePresenceEvent.EVENT_BT_CONNECTED -> old or BIT_BT
            DevicePresenceEvent.EVENT_BT_DISCONNECTED -> old and BIT_BT.inv()
            DevicePresenceEvent.EVENT_SELF_MANAGED_APPEARED -> old or BIT_SELF
            DevicePresenceEvent.EVENT_SELF_MANAGED_DISAPPEARED -> old and BIT_SELF.inv()
            DevicePresenceEvent.EVENT_ASSOCIATION_REMOVED -> 0
            else -> old
        }
        val edit = prefs.edit()
        if (updated == 0) edit.remove(key) else edit.putInt(key, updated)
        edit.apply()
    }

    @Synchronized
    fun noteAssociationLegacy(context: Context, associationId: Int, present: Boolean) {
        if (associationId < 0) return
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val key = "$ASSOCIATION_PREFIX$associationId"
        val old = prefs.getInt(key, 0)
        val updated = if (present) old or BIT_LEGACY else old and BIT_LEGACY.inv()
        val edit = prefs.edit()
        if (updated == 0) edit.remove(key) else edit.putInt(key, updated)
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
        if (present) edit.putInt(key, BIT_LEGACY) else edit.remove(key)
        edit.apply()
    }

    fun presentAssociationIds(context: Context): Set<Int> {
        val all = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).all
        return all.entries.mapNotNull { (key, value) ->
            if (!key.startsWith(ASSOCIATION_PREFIX) || (value as? Int ?: 0) == 0) return@mapNotNull null
            key.removePrefix(ASSOCIATION_PREFIX).toIntOrNull()?.takeIf { it >= 0 }
        }.toSet()
    }

    fun presentLegacyIds(context: Context): Set<String> {
        val all = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).all
        return all.entries.mapNotNull { (key, value) ->
            if (!key.startsWith(LEGACY_PREFIX) || (value as? Int ?: 0) == 0) return@mapNotNull null
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

/**
 * System-bound callback only. Presence is supplied by Android for an association the user/admin has
 * explicitly approved. Brick does not run a second continuous Bluetooth scanner for companions.
 */
class BrickCompanionDeviceService : CompanionDeviceService() {
    @Suppress("DEPRECATION")
    override fun onDeviceAppeared(address: String) {
        CompanionPresenceStore.noteLegacyAddress(this, address, true)
    }

    @Suppress("DEPRECATION")
    override fun onDeviceDisappeared(address: String) {
        CompanionPresenceStore.noteLegacyAddress(this, address, false)
    }

    @Suppress("DEPRECATION")
    override fun onDeviceAppeared(associationInfo: AssociationInfo) {
        CompanionPresenceStore.noteAssociationLegacy(this, associationInfo.id, true)
    }

    @Suppress("DEPRECATION")
    override fun onDeviceDisappeared(associationInfo: AssociationInfo) {
        CompanionPresenceStore.noteAssociationLegacy(this, associationInfo.id, false)
    }

    override fun onDevicePresenceEvent(event: DevicePresenceEvent) {
        CompanionPresenceStore.noteAssociation(this, event.associationId, event.event)
    }
}

internal data class CompanionAssociationSnapshot(
    val associatedCount: Int,
    val presentSignalIds: List<String>,
    val capabilityDetail: String
)

/**
 * Registers only existing CompanionDeviceManager associations for presence callbacks. Association
 * creation remains a deliberate setup action; this helper never silently trusts a nearby device.
 */
internal class CompanionPresenceController(private val context: Context) {
    private val appContext = context.applicationContext
    private val manager: CompanionDeviceManager? = if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        appContext.packageManager.hasSystemFeature(PackageManager.FEATURE_COMPANION_DEVICE_SETUP)
    ) appContext.getSystemService(CompanionDeviceManager::class.java) else null

    private val observedAssociationIds = linkedSetOf<Int>()
    private val observedLegacyAddresses = linkedSetOf<String>()

    @Synchronized
    fun snapshotAndEnsureObserving(): CompanionAssociationSnapshot {
        val cdm = manager ?: return CompanionAssociationSnapshot(0, emptyList(), "companion_setup_unsupported")
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return CompanionAssociationSnapshot(0, emptyList(), "presence_api_unsupported")
        }

        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val associations = cdm.myAssociations
                val validIds = associations.mapTo(linkedSetOf()) { it.id }
                val presentIds = CompanionPresenceStore.presentAssociationIds(appContext).intersect(validIds)
                val presentSignals = presentIds.sorted().map { id ->
                    AtlasPrivacyId.reduce("comp", "association:$id")
                }

                if (Build.VERSION.SDK_INT >= 36) {
                    associations.forEach { association ->
                        if (observedAssociationIds.add(association.id)) {
                            val request = ObservingDevicePresenceRequest.Builder()
                                .setAssociationId(association.id)
                                .build()
                            runCatching { cdm.startObservingDevicePresence(request) }
                                .onFailure { observedAssociationIds.remove(association.id) }
                        }
                    }
                    CompanionPresenceStore.retainAssociations(appContext, validIds, emptySet())
                } else {
                    @Suppress("DEPRECATION")
                    val addresses = associations.mapNotNull { it.deviceMacAddress?.toString() }
                    addresses.forEach { address ->
                        if (observedLegacyAddresses.add(address)) {
                            @Suppress("DEPRECATION")
                            runCatching { cdm.startObservingDevicePresence(address) }
                                .onFailure { observedLegacyAddresses.remove(address) }
                        }
                    }
                    // API 33-35 callbacks include AssociationInfo, so association IDs remain the
                    // canonical persisted state even though registration uses the legacy address API.
                    CompanionPresenceStore.retainAssociations(appContext, validIds, emptySet())
                }
                CompanionAssociationSnapshot(associations.size, presentSignals, "associated")
            } else {
                @Suppress("DEPRECATION")
                val addresses = cdm.associations
                val validLegacy = addresses.mapNotNull { raw ->
                    runCatching { AtlasPrivacyId.reduce("comp", "address:${raw.trim().lowercase()}") }.getOrNull()
                }.toSet()
                addresses.forEach { address ->
                    if (observedLegacyAddresses.add(address)) {
                        @Suppress("DEPRECATION")
                        runCatching { cdm.startObservingDevicePresence(address) }
                            .onFailure { observedLegacyAddresses.remove(address) }
                    }
                }
                CompanionPresenceStore.retainAssociations(appContext, emptySet(), validLegacy)
                val present = CompanionPresenceStore.presentLegacyIds(appContext).intersect(validLegacy).sorted()
                CompanionAssociationSnapshot(addresses.size, present, "associated_legacy")
            }
        } catch (_: SecurityException) {
            CompanionAssociationSnapshot(0, emptyList(), "presence_permission_unavailable")
        } catch (_: Throwable) {
            CompanionAssociationSnapshot(0, emptyList(), "presence_temporarily_unavailable")
        }
    }
}
