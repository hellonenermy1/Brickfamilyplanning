package com.brick.safety.privileged

/**
 * Narrow Phase 6 privileged surface. Brick intentionally exposes typed capabilities only.
 * There is no generic shell/command API here.
 */
enum class PrivilegedCapability {
    LOCATION_CONTROL,
    WIFI_EVIDENCE,
    BLE_EVIDENCE,
    CELL_EVIDENCE,
    POWER_DIAGNOSTICS,
    POWER_REPAIR,
    SOS_LOCATION_ATTEMPT
}

data class PrivilegedBridgeHealth(
    val provider: String,
    val available: Boolean,
    val connected: Boolean,
    val permissionGranted: Boolean,
    val capabilities: Set<PrivilegedCapability>,
    val lastError: String? = null
)

data class PrivilegedWifiEvidence(
    val ssidHash: String?,
    val bssidHash: String?,
    val rssiDbm: Int?,
    val frequencyMhz: Int?
)

data class PrivilegedBleEvidence(
    val beaconHash: String,
    val rssiDbm: Int
)

data class PrivilegedCellEvidence(
    val radio: String,
    val identityHash: String?,
    val signalDbm: Int?
)

data class PrivilegedPowerDiagnostics(
    val backgroundRestricted: Boolean?,
    val batteryOptimizationExempt: Boolean?,
    val detail: String?
)

interface PrivilegedBridge {
    fun health(): PrivilegedBridgeHealth
    fun setParentLocationState(enabled: Boolean): Result<Boolean>
    fun wifiEvidence(): Result<List<PrivilegedWifiEvidence>>
    fun bleEvidence(): Result<List<PrivilegedBleEvidence>>
    fun cellEvidence(): Result<List<PrivilegedCellEvidence>>
    fun powerDiagnostics(): Result<PrivilegedPowerDiagnostics>
    fun requestPowerRepair(): Result<Boolean>
    fun attemptSosLocationEnable(): Result<Boolean>
}

/** Normal Brick behavior when no privileged provider is installed, connected or allowed. */
object NoPrivilegedBridge : PrivilegedBridge {
    private fun unavailable(): Result<Nothing> = Result.failure(IllegalStateException("privileged provider unavailable"))

    override fun health() = PrivilegedBridgeHealth(
        provider = "none",
        available = false,
        connected = false,
        permissionGranted = false,
        capabilities = emptySet()
    )

    override fun setParentLocationState(enabled: Boolean): Result<Boolean> = unavailable()
    override fun wifiEvidence(): Result<List<PrivilegedWifiEvidence>> = unavailable()
    override fun bleEvidence(): Result<List<PrivilegedBleEvidence>> = unavailable()
    override fun cellEvidence(): Result<List<PrivilegedCellEvidence>> = unavailable()
    override fun powerDiagnostics(): Result<PrivilegedPowerDiagnostics> = unavailable()
    override fun requestPowerRepair(): Result<Boolean> = unavailable()
    override fun attemptSosLocationEnable(): Result<Boolean> = unavailable()
}

/**
 * Runtime indirection keeps Brick Core independent from Shizuku. If the optional provider dies,
 * callers immediately receive a failure and Brick continues with normal Android APIs.
 */
object PrivilegedBridgeRuntime {
    @Volatile private var bridge: PrivilegedBridge = NoPrivilegedBridge

    fun current(): PrivilegedBridge = bridge
    fun install(provider: PrivilegedBridge) { bridge = provider }
    fun clear() { bridge = NoPrivilegedBridge }
}
