package com.brick.safety.fusion

import android.content.Context
import com.brick.safety.atlas.AtlasRuntimeSnapshot

/**
 * Process-local access point for the encrypted owner-bound learned-place registry.
 *
 * BrickApplication owns initialization/config synchronization. Fusion only reads constraints.
 * Failure or absence is intentionally equivalent to "no learned-place evidence" so this optional
 * provider can never take down the pre-existing fallback path.
 */
object Phase5LearnedPlaceRuntime {
    @Volatile private var registry: LearnedPlaceRegistry? = null

    @Synchronized
    fun initialize(context: Context) {
        if (registry == null) registry = LearnedPlaceRegistry(context.applicationContext)
    }

    fun update(ownerDeviceId: String, definitions: Collection<LearnedPlaceDefinition>): Boolean =
        runCatching { registry?.update(ownerDeviceId, definitions) == true }.getOrDefault(false)

    fun update(
        context: Context,
        ownerDeviceId: String,
        definitions: Collection<LearnedPlaceDefinition>
    ): Boolean {
        initialize(context)
        return update(ownerDeviceId, definitions)
    }

    fun constraint(atlas: AtlasRuntimeSnapshot?, nowElapsedMs: Long): FusionConstraint? =
        runCatching { registry?.constraint(atlas, nowElapsedMs) }.getOrNull()

    fun count(): Int = runCatching { registry?.count() ?: 0 }.getOrDefault(0)
}
