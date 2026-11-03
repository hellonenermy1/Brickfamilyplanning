package com.brick.safety.privileged

/**
 * Exact command policy for the private Shizuku UserService process executor. The AIDL never carries
 * command text; this is a second line of defence so future internal refactors cannot accidentally
 * turn runFixed() into a generic shell surface.
 */
internal object PrivilegedCommandPolicy {
    private const val BRICK_PACKAGE = "com.brick.safety"

    fun allows(command: List<String>): Boolean = when {
        command == listOf("cmd", "location", "is-location-enabled") -> true
        command.size == 4 &&
            command[0] == "cmd" && command[1] == "location" && command[2] == "set-location-enabled" &&
            command[3] in setOf("true", "false") -> true
        command == listOf("cmd", "deviceidle", "whitelist") -> true
        command == listOf("cmd", "deviceidle", "whitelist", "+$BRICK_PACKAGE") -> true
        command == listOf("cmd", "appops", "get", BRICK_PACKAGE, "RUN_ANY_IN_BACKGROUND") -> true
        else -> false
    }
}
