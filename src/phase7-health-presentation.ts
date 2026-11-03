export type Phase7ProviderStatus = "active" | "degraded" | "unavailable" | "unsupported" | "unknown";
export type Phase7DeviceHealthStatus = "healthy" | "degraded" | "offline" | "unknown";
export type Phase7PositionHealthStatus = "fresh" | "degraded" | "unavailable" | "unknown";

export type Phase7HealthCheck = {
  id: string;
  label: string;
  state: "ok" | "attention" | "critical" | "neutral";
  value: string;
};

export type Phase7ProviderPresentation = {
  id: string;
  label: string;
  status: Phase7ProviderStatus;
  capability: string | null;
  health: string | null;
  explanation: string;
};

export type Phase7HealthPresentation = {
  protocol: 1;
  basis: {
    healthSequence: number | null;
    receivedAt: number | null;
  };
  device: {
    status: Phase7DeviceHealthStatus;
    reason: string;
    checks: Phase7HealthCheck[];
  };
  position: {
    status: Phase7PositionHealthStatus;
    reason: string;
    locationEnabled: boolean | null;
    locationSubscribed: boolean | null;
    locationAgeMs: number | null;
    gnssUsedInFix: number | null;
    gnssTotal: number | null;
  };
  providers: Phase7ProviderPresentation[];
};

type PositionPresentationLike = {
  positionClass?: unknown;
  confidence?: unknown;
  freshness?: unknown;
  geometry?: { kind?: unknown } | null;
};

type SnapshotLike = {
  health?: Record<string, unknown> | null;
  derived?: Record<string, unknown> | null;
};

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function token(value: unknown): string | null {
  const v = text(value);
  return v ? v.toLowerCase().replace(/[\s-]+/g, "_") : null;
}

function pretty(value: string | null) {
  return value ? value.replaceAll("_", " ") : "not reported";
}

function check(id: string, label: string, raw: unknown, good: string, bad: string, critical = false): Phase7HealthCheck {
  const value = bool(raw);
  if (value === null) return { id, label, state: "neutral", value: "Not reported" };
  return { id, label, state: value ? "ok" : critical ? "critical" : "attention", value: value ? good : bad };
}

function classifyProvider(capabilityRaw: unknown, healthRaw: unknown): Phase7ProviderStatus {
  const capability = token(capabilityRaw);
  const health = token(healthRaw);
  const unsupported = ["unsupported", "not_supported", "hardware_unsupported", "no_hardware"];
  if (capability && unsupported.some(v => capability.includes(v))) return "unsupported";

  if (health) {
    if (["healthy", "active", "ok", "ready"].some(v => health === v || health.includes(`${v}_`))) return "active";
    if (["degraded", "partial", "stale", "limited"].some(v => health.includes(v))) return "degraded";
    if (["failed", "failure", "error", "unavailable", "permission_denied", "disabled", "blocked"].some(v => health.includes(v))) return "unavailable";
  }

  if (capability) {
    if (["permission_denied", "permission_missing", "disabled", "blocked", "unavailable"].some(v => capability.includes(v))) return "unavailable";
    // A provider being supported does not prove it is currently producing healthy evidence.
    if (["supported", "available", "capable"].some(v => capability.includes(v))) return "unknown";
  }
  return "unknown";
}

function provider(
  h: Record<string, unknown>,
  id: string,
  label: string,
  capabilityKey: string,
  healthKey: string
): Phase7ProviderPresentation {
  const capability = text(h[capabilityKey]);
  const health = text(h[healthKey]);
  const status = classifyProvider(capability, health);
  const explanation = status === "active" ? `${label} is reporting healthy evidence.` :
    status === "degraded" ? `${label} is available but currently degraded.` :
    status === "unavailable" ? `${label} cannot currently contribute evidence.` :
    status === "unsupported" ? `${label} is not supported on this phone; Brick treats that as neutral.` :
    `${label} has not reported enough status information yet.`;
  return { id, label, status, capability, health, explanation };
}

function privilegedProvider(h: Record<string, unknown>): Phase7ProviderPresentation {
  const name = text(h.privilegedProvider);
  const available = bool(h.privilegedAvailable);
  const connected = bool(h.privilegedConnected);
  const granted = bool(h.privilegedPermissionGranted);
  let status: Phase7ProviderStatus = "unknown";
  if (available === false && (!name || name === "none")) status = "unknown";
  else if (connected === true && granted === true) status = "active";
  else if (available === true && (connected === false || granted === false)) status = "degraded";
  const health = [connected === null ? null : connected ? "connected" : "disconnected", granted === null ? null : granted ? "permission granted" : "permission missing"].filter(Boolean).join(" · ") || null;
  return {
    id: "privileged",
    label: "Privileged fallback",
    status,
    capability: name,
    health,
    explanation: status === "active" ? "The optional privileged fallback is connected." :
      status === "degraded" ? "The optional privileged fallback is configured but not fully available." :
      "The privileged fallback has no active status; Brick Core must continue without depending on it."
  };
}

export function buildPhase7HealthPresentation(
  snapshot: SnapshotLike,
  positionPresentation: PositionPresentationLike | null
): Phase7HealthPresentation {
  const h = snapshot.health ?? null;
  if (!h) {
    return {
      protocol: 1,
      basis: { healthSequence: null, receivedAt: null },
      device: { status: "unknown", reason: "No health heartbeat has been received.", checks: [] },
      position: {
        status: "unknown",
        reason: "No phone health heartbeat is available.",
        locationEnabled: null,
        locationSubscribed: null,
        locationAgeMs: null,
        gnssUsedInFix: null,
        gnssTotal: null
      },
      providers: []
    };
  }

  const derivedStatus = token(snapshot.derived?.deviceStatus);
  const operationalStatus = token(h.operationalStatus);
  const network = token(h.network);
  const serviceActive = bool(h.serviceActive);
  const journalHealthy = bool(h.journalWriteHealthy);
  const safetyHealthy = bool(h.safetyOutboxWriteHealthy);

  let deviceStatus: Phase7DeviceHealthStatus = "unknown";
  if (derivedStatus === "offline" || network === "offline") deviceStatus = "offline";
  else if (operationalStatus === "degraded" || derivedStatus === "degraded" || serviceActive === false || journalHealthy === false || safetyHealthy === false) deviceStatus = "degraded";
  else if (operationalStatus === "healthy" || derivedStatus === "healthy") deviceStatus = "healthy";

  const deviceReasonRaw = text(h.operationalReason);
  const deviceReason = deviceStatus === "offline" ? "The phone heartbeat or network is offline." :
    deviceStatus === "degraded" ? (deviceReasonRaw ? pretty(deviceReasonRaw) : "One or more measured device checks need attention.") :
    deviceStatus === "healthy" ? "Measured Brick Core device checks are healthy." :
    "Device health has not been classified yet.";

  const checks: Phase7HealthCheck[] = [
    check("service", "Tracker service", h.serviceActive, "Active", "Inactive", true),
    check("journal", "Local journal", h.journalWriteHealthy, "Healthy", "Write failure", true),
    check("safety_outbox", "Safety outbox", h.safetyOutboxWriteHealthy, "Healthy", "Write failure", true),
    check("background", "Background execution", bool(h.backgroundRestricted) === null ? null : !bool(h.backgroundRestricted)!, "Allowed", "Restricted"),
    check("battery_optimization", "Battery optimization", h.batteryOptimizationExempt, "Exempt", "Active"),
    check("network_validated", "Validated network", h.networkValidated, "Validated", "Not validated")
  ];

  const locationEnabled = bool(h.locationEnabled);
  const locationSubscribed = bool(h.locationSubscribed);
  const finePermission = bool(h.fineLocationPermission);
  const backgroundPermission = bool(h.backgroundLocationPermission);
  const locationAgeMs = finite(h.locationAgeMs);
  const positionClass = token(positionPresentation?.positionClass);
  const freshness = token(positionPresentation?.freshness);
  const geometry = token(positionPresentation?.geometry?.kind);

  let positionStatus: Phase7PositionHealthStatus = "unknown";
  let positionReason = "Position health has not been classified yet.";
  if (locationEnabled === false || finePermission === false || locationSubscribed === false) {
    positionStatus = "unavailable";
    positionReason = locationEnabled === false ? "Phone Location is off." : finePermission === false ? "Precise location permission is missing." : "Brick is not subscribed to location updates.";
  } else if (geometry === "none" || positionClass === "unknown") {
    positionStatus = "unavailable";
    positionReason = "Brick has no trustworthy current position to display.";
  } else if (freshness === "stale" || positionClass === "estimated" || positionClass === "coarse" || positionClass === "last_known" || backgroundPermission === false) {
    positionStatus = "degraded";
    positionReason = freshness === "stale" ? "Position evidence is stale." :
      backgroundPermission === false ? "Background location permission is missing." :
      `Current position is ${pretty(positionClass)} rather than precise.`;
  } else if (freshness === "fresh" || freshness === "aging") {
    positionStatus = freshness === "fresh" ? "fresh" : "degraded";
    positionReason = freshness === "fresh" ? "Current position evidence is fresh." : "Current position evidence is aging but still within the measured freshness window.";
  }

  const providers = [
    provider(h, "wifi", "Wi-Fi environment", "atlasWifiProviderCapability", "atlasWifiProviderHealth"),
    provider(h, "wifi_rtt", "Wi-Fi RTT", "atlasRttProviderCapability", "atlasRttProviderHealth"),
    provider(h, "ble", "Bluetooth environment", "atlasBleProviderCapability", "atlasBleProviderHealth"),
    provider(h, "cellular", "Cellular context", "atlasCellularProviderCapability", "atlasCellularProviderHealth"),
    provider(h, "lan", "LAN discovery", "atlasLanProviderCapability", "atlasLanProviderHealth"),
    provider(h, "gnss", "GNSS sky", "atlasGnssProviderCapability", "atlasGnssProviderHealth"),
    provider(h, "network", "Network context", "atlasNetworkProviderCapability", "atlasNetworkProviderHealth"),
    provider(h, "device_context", "Device context", "atlasDeviceContextProviderCapability", "atlasDeviceContextProviderHealth"),
    privilegedProvider(h)
  ];

  return {
    protocol: 1,
    basis: {
      healthSequence: integer(h.healthSequence),
      receivedAt: integer(h.receivedAt)
    },
    device: { status: deviceStatus, reason: deviceReason, checks },
    position: {
      status: positionStatus,
      reason: positionReason,
      locationEnabled,
      locationSubscribed,
      locationAgeMs,
      gnssUsedInFix: finite(h.gnssUsedInFix),
      gnssTotal: finite(h.gnssTotal)
    },
    providers
  };
}
