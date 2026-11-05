package com.brick.safety.beta

/** Pure acceptance rules. Missing/duplicate/unknown checks never imply readiness. */
object BetaReadinessModel {
    enum class Status { PASS, FAIL, PENDING, UNSUPPORTED }
    data class Check(val id: String, val status: Status, val detail: String, val required: Boolean = true)
    val backendChecks = listOf("d1_roundtrip", "r2_roundtrip", "queue_roundtrip", "do_roundtrip", "history_readback", "portal_delivery")
    val requiredChecks = setOf("build_identity", "role", "permissions", "management", "tracking", "journal", "network", "recorder", "backend_identity") + backendChecks
    fun ready(checks: List<Check>): Boolean = checks.map { it.id }.distinct().size == checks.size &&
        requiredChecks.all { id -> checks.any { it.id == id && it.required && it.status == Status.PASS } } &&
        checks.filter { it.required }.all { it.status == Status.PASS }
}
