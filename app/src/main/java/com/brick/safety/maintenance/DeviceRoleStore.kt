package com.brick.safety.maintenance

import android.content.Context
import com.brick.safety.crypto.DeviceKeys
import java.net.URL

/** One APK, explicit runtime role. Parent/guardian mode never runs child tracking. */
object DeviceRoleStore {
    private const val PREFS = "brick_device_role_v1"
    private const val KEY_ROLE = "role"
    private const val KEY_PARENT_PORTAL = "parentPortal"
    private const val KEY_CHANGED_AT = "changedAtMs"

    enum class Role { UNPROVISIONED, CHILD, PARENT_GUARDIAN }

    fun role(context: Context): Role {
        val app = context.applicationContext
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val stored = prefs.getString(KEY_ROLE, null)
        if (stored != null) return runCatching { Role.valueOf(stored) }.getOrDefault(Role.UNPROVISIONED)
        // Safe migration for already-paired installs.
        return if (app.getSharedPreferences("brick", Context.MODE_PRIVATE).contains("deviceId")) {
            Role.CHILD
        } else {
            Role.UNPROVISIONED
        }
    }

    fun parentPortal(context: Context): String? =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PARENT_PORTAL, null)

    fun setChildAfterPairing(context: Context): Boolean = setRole(context, Role.CHILD, null)

    /** Called only from the local Maintenance & Recovery Console. */
    fun provisionParentGuardian(context: Context, portalBase: String): Boolean {
        val normalized = secureBase(portalBase) ?: return false
        val app = context.applicationContext
        DeepOffManager.quiesce(app)
        // Moving away from the child identity is an authorised local reprovision boundary. Clear the
        // non-secret key binding/fault before removing the device ID so a later child re-enrollment
        // can deliberately bind whichever Keystore key is actually present at that time.
        if (!DeviceKeys.clearIdentityBinding(app)) return false
        val cleared = app.getSharedPreferences("brick", Context.MODE_PRIVATE).edit()
            .remove("deviceId")
            .remove("apiBase")
            .commit()
        if (!cleared) return false
        return setRole(app, Role.PARENT_GUARDIAN, normalized)
    }

    /** Called only from the local Maintenance & Recovery Console before explicit re-provisioning. */
    fun resetForReprovision(context: Context): Boolean {
        val app = context.applicationContext
        DeepOffManager.quiesce(app)
        if (!DeviceKeys.clearIdentityBinding(app)) return false
        val cleared = app.getSharedPreferences("brick", Context.MODE_PRIVATE).edit()
            .remove("deviceId")
            .remove("apiBase")
            .commit()
        if (!cleared) return false
        return setRole(app, Role.UNPROVISIONED, null)
    }

    private fun setRole(context: Context, role: Role, portalBase: String?): Boolean =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_ROLE, role.name)
            .apply {
                if (portalBase == null) remove(KEY_PARENT_PORTAL)
                else putString(KEY_PARENT_PORTAL, portalBase)
            }
            .putLong(KEY_CHANGED_AT, System.currentTimeMillis())
            .commit()

    private fun secureBase(value: String): String? = try {
        val u = URL(value.trim().trimEnd('/'))
        if (!u.protocol.equals("https", true) || u.host.isBlank() || u.userInfo != null ||
            u.query != null || u.ref != null || (u.path.isNotEmpty() && u.path != "/")) {
            null
        } else {
            "https://${u.authority}"
        }
    } catch (_: Throwable) {
        null
    }
}
