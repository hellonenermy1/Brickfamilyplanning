package com.brick.safety.privileged

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PrivilegedCommandPolicyTest {
    @Test
    fun approvedCommandsAreExact() {
        assertTrue(PrivilegedCommandPolicy.allows(listOf("cmd", "location", "is-location-enabled")))
        assertTrue(PrivilegedCommandPolicy.allows(listOf("cmd", "location", "set-location-enabled", "true")))
        assertTrue(PrivilegedCommandPolicy.allows(listOf("cmd", "location", "set-location-enabled", "false")))
        assertTrue(PrivilegedCommandPolicy.allows(listOf("cmd", "deviceidle", "whitelist")))
        assertTrue(PrivilegedCommandPolicy.allows(listOf("cmd", "deviceidle", "whitelist", "+com.brick.safety")))
        assertTrue(PrivilegedCommandPolicy.allows(listOf("cmd", "appops", "get", "com.brick.safety", "RUN_ANY_IN_BACKGROUND")))
    }

    @Test
    fun arbitraryShellAndAdjacentCommandsAreRejected() {
        assertFalse(PrivilegedCommandPolicy.allows(listOf("sh", "-c", "id")))
        assertFalse(PrivilegedCommandPolicy.allows(listOf("cmd", "package", "list", "packages")))
        assertFalse(PrivilegedCommandPolicy.allows(listOf("cmd", "location", "set-location-enabled", "maybe")))
        assertFalse(PrivilegedCommandPolicy.allows(listOf("cmd", "deviceidle", "whitelist", "+other.package")))
        assertFalse(PrivilegedCommandPolicy.allows(listOf("cmd", "appops", "set", "com.brick.safety", "RUN_ANY_IN_BACKGROUND", "allow")))
    }
}
