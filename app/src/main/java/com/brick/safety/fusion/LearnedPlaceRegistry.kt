package com.brick.safety.fusion

import android.content.Context
import android.util.AtomicFile
import com.brick.safety.atlas.AtlasRuntimeSnapshot
import com.brick.safety.crypto.JournalCipher
import com.brick.safety.location.GeoMath
import com.brick.safety.location.PositionQuality
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** A parent-configured Brick Place region. Environmental fingerprints remain owned by Phase 4 Atlas. */
data class LearnedPlaceDefinition(
    val id: String,
    val name: String,
    val latitude: Double,
    val longitude: Double,
    val radiusM: Float
) {
    init {
        require(id.matches(Regex("[A-Za-z0-9._:-]{1,96}")))
        require(name.isNotBlank() && name.length <= 64)
        require(latitude.isFinite() && latitude in -90.0..90.0)
        require(longitude.isFinite() && longitude in -180.0..180.0)
        require(radiusM.isFinite() && radiusM in 25f..5_000f)
    }
}

object LearnedPlaceMatcher {
    private const val MAX_ATLAS_AGE_MS = 45_000L
    private const val MIN_SUPPORT = 0.65
    private const val MAX_NEGATIVE = 0.08

    /**
     * Convert a strong Atlas location hypothesis into a named place only when it identifies exactly
     * one configured region. The configured region is the output geometry; Atlas never creates a
     * room-level point just because its internal grid cell is small.
     */
    fun match(
        places: Collection<LearnedPlaceDefinition>,
        atlas: AtlasRuntimeSnapshot?,
        nowElapsedMs: Long
    ): FusionConstraint? {
        atlas ?: return null
        if (atlas.observedElapsedMs !in 1..nowElapsedMs || nowElapsedMs - atlas.observedElapsedMs > MAX_ATLAS_AGE_MS) return null
        val top = atlas.candidates.firstOrNull() ?: return null
        if (top.ambiguous || top.supportWeight < MIN_SUPPORT || top.independenceGroups < 2 || top.matchedSignals < 2 || top.negativePenalty > MAX_NEGATIVE) return null
        if (!top.latitude.isFinite() || top.latitude !in -90.0..90.0 || !top.longitude.isFinite() || top.longitude !in -180.0..180.0) return null
        if (!top.uncertaintyM.isFinite() || top.uncertaintyM !in 1f..1_000f) return null

        val matches = places.filter { place ->
            GeoMath.distanceMeters(place.latitude, place.longitude, top.latitude, top.longitude) <= place.radiusM
        }.take(2)
        if (matches.size != 1) return null
        val place = matches.single()

        // Do not call a huge uncertain environmental region a named-place anchor. For small places,
        // allow a modest 150 m Atlas uncertainty; for larger parent regions, scale with the region.
        val allowedAtlasUncertainty = maxOf(150f, place.radiusM * 1.5f).coerceAtMost(2_000f)
        if (top.uncertaintyM > allowedAtlasUncertainty) return null
        val outputRadius = maxOf(place.radiusM, top.uncertaintyM, 35f).coerceAtMost(5_000f)
        return FusionConstraint(
            id = "place:${place.id}",
            kind = FusionEvidenceKind.LEARNED_PLACE,
            // Same underlying environmental evidence as Atlas. The fusion engine must collapse them
            // into one independence group rather than count "Atlas" and "Home" as two sensors.
            independenceGroup = "atlas.environment",
            observedElapsedMs = atlas.observedElapsedMs,
            latitude = place.latitude,
            longitude = place.longitude,
            radiusM = outputRadius,
            supportWeight = top.supportWeight.coerceIn(MIN_SUPPORT, 0.92),
            strength = FusionStrength.STRONG,
            upperState = PositionQuality.ANCHORED,
            maxAgeMs = MAX_ATLAS_AGE_MS,
            shapeHint = FusionShapeKind.PLACE_AREA,
            explanation = "learned place: ${place.name.take(48)}"
        )
    }
}

/**
 * Small encrypted owner-bound cache of named place regions. This is configuration, not a duplicate
 * radio-fingerprint database. Phase 4 Atlas remains the only learned environmental model.
 */
class LearnedPlaceRegistry(context: Context) {
    companion object {
        private const val VERSION = 1
        private const val MAX_PLACES = 32
        private const val MAX_PLAIN_BYTES = 24_000
        private const val MAX_ENCRYPTED_BYTES = 32_000
        internal const val FILE_NAME = "brick_learned_places_v1.bin"
    }

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("brick", Context.MODE_PRIVATE)
    private val atomic = AtomicFile(File(appContext.filesDir, FILE_NAME))
    private var ownerDeviceId: String? = null
    private var places: List<LearnedPlaceDefinition> = emptyList()

    init { restoreForCurrentOwner() }

    @Synchronized
    fun update(owner: String, definitions: Collection<LearnedPlaceDefinition>): Boolean {
        val current = currentOwner() ?: return false
        if (owner != current || owner.isBlank() || owner.length > 128) return false
        val normalized = definitions.distinctBy { it.id }.sortedBy { it.id }.take(MAX_PLACES)
        ownerDeviceId = current
        places = normalized
        return persist()
    }

    @Synchronized
    fun constraint(atlas: AtlasRuntimeSnapshot?, nowElapsedMs: Long): FusionConstraint? {
        ensureCurrentOwner()
        return LearnedPlaceMatcher.match(places, atlas, nowElapsedMs)
    }

    @Synchronized fun count(): Int { ensureCurrentOwner(); return places.size }

    private fun currentOwner(): String? = prefs.getString("deviceId", null)?.takeIf { it.isNotBlank() }

    private fun ensureCurrentOwner() {
        val current = currentOwner()
        if (current == ownerDeviceId) return
        ownerDeviceId = current
        places = emptyList()
        if (current == null) {
            runCatching { atomic.delete() }
            prefs.edit().putInt("phase5LearnedPlaceCount", 0).apply()
        } else {
            restoreForCurrentOwner()
        }
    }

    private fun restoreForCurrentOwner() {
        val current = currentOwner()
        ownerDeviceId = current
        places = emptyList()
        if (current == null || !atomic.baseFile.exists()) return
        try {
            val encrypted = atomic.readFully()
            require(encrypted.size in 13..MAX_ENCRYPTED_BYTES)
            val plain = JournalCipher.decrypt(encrypted)
            require(plain.size <= MAX_PLAIN_BYTES)
            val root = JSONObject(plain.toString(Charsets.UTF_8))
            require(root.optInt("v", 0) == VERSION)
            require(root.optString("owner", "") == current) { "learned-place owner mismatch" }
            val array = root.optJSONArray("places") ?: JSONArray()
            val restored = ArrayList<LearnedPlaceDefinition>(minOf(array.length(), MAX_PLACES))
            for (i in 0 until minOf(array.length(), MAX_PLACES)) {
                val j = array.getJSONObject(i)
                restored += LearnedPlaceDefinition(
                    id = j.getString("id"),
                    name = j.getString("name"),
                    latitude = j.getDouble("lat"),
                    longitude = j.getDouble("lon"),
                    radiusM = j.getDouble("radius").toFloat()
                )
            }
            places = restored.distinctBy { it.id }.sortedBy { it.id }
            prefs.edit().putBoolean("phase5LearnedPlacesHealthy", true).putInt("phase5LearnedPlaceCount", places.size).apply()
        } catch (_: Throwable) {
            places = emptyList()
            runCatching { atomic.delete() }
            prefs.edit().putBoolean("phase5LearnedPlacesHealthy", false).putInt("phase5LearnedPlaceCount", 0).apply()
        }
    }

    private fun persist(): Boolean {
        val owner = ownerDeviceId ?: return false
        if (owner != currentOwner()) return false
        return try {
            val array = JSONArray()
            for (place in places) {
                array.put(JSONObject()
                    .put("id", place.id)
                    .put("name", place.name)
                    .put("lat", place.latitude)
                    .put("lon", place.longitude)
                    .put("radius", place.radiusM.toDouble()))
            }
            val plain = JSONObject().put("v", VERSION).put("owner", owner).put("places", array)
                .toString().toByteArray(Charsets.UTF_8)
            require(plain.size <= MAX_PLAIN_BYTES)
            val encrypted = JournalCipher.encrypt(plain)
            require(encrypted.size <= MAX_ENCRYPTED_BYTES)
            val output = atomic.startWrite()
            try {
                output.write(encrypted)
                output.fd.sync()
                atomic.finishWrite(output)
            } catch (error: Throwable) {
                atomic.failWrite(output)
                throw error
            }
            prefs.edit().putBoolean("phase5LearnedPlacesHealthy", true).putInt("phase5LearnedPlaceCount", places.size).apply()
            true
        } catch (_: Throwable) {
            prefs.edit().putBoolean("phase5LearnedPlacesHealthy", false).apply()
            false
        }
    }
}
