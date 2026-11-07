import type { DeviceHealth, RealtimeSafetyEvent } from "./device-do";

export type OpsEnv = { DB: D1Database };

export type HealthClassification = {
  status: "healthy" | "degraded";
  reason: string;
  positionAvailable: boolean;
  severity: "info" | "warning" | "critical";
};

type Incident = {
  id: string;
  kind: string;
  severity: string;
  started_at: number;
  last_seen_at: number;
  ended_at: number | null;
  alerted_at: number | null;
  auto_recovered: number;
  detail_json: string;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

function flag(v: boolean | undefined): number | null { return v === undefined ? null : v ? 1 : 0; }
function nullableNumber(v: number | null | undefined): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }

export function classifyHealth(h: DeviceHealth): HealthClassification {
  const interval = Math.min(Math.max(h.trackingIntervalMs ?? 5_000, 1_000), 120_000);
  const staleLimit = Math.max(60_000, interval * 3 + 30_000);
  const positionAvailable = h.locationEnabled && h.locationSubscribed && h.locationAgeMs !== null && h.locationAgeMs <= staleLimit;

  const checks: Array<[boolean, string, HealthClassification["severity"]]> = [
    [h.serviceActive === false, "tracker_service_inactive", "critical"],
    [h.safetyOutboxWriteHealthy === false, "safety_outbox_write_failed", "critical"],
    [h.journalWriteHealthy === false, "local_journal_write_failed", "critical"],
    [h.fineLocationPermission === false, "fine_location_permission_missing", "critical"],
    [!h.locationEnabled, "location_disabled", "critical"],
    [!h.locationSubscribed, "location_subscription_inactive", "critical"],
    [h.backgroundLocationPermission === false, "background_location_permission_missing", "warning"],
    [h.activityRecognitionPermission === false, "activity_recognition_permission_missing", "warning"],
    [h.backgroundRestricted === true, "background_execution_restricted", "warning"],
    [h.batteryOptimizationExempt === false, "battery_optimization_active", "warning"],
    [h.network === "offline" || h.networkValidated === false, "network_unavailable", "warning"],
    [(h.pendingSafetyEvents ?? 0) > 0 && (h.oldestPendingAgeMs ?? 0) >= 60_000, "safety_event_backlog", "critical"],
    [h.pendingRecords >= 1_000 || (h.oldestPendingAgeMs ?? 0) >= 120_000, "location_backlog", "warning"],
    [h.ackAgeMs !== null && h.ackAgeMs >= 120_000 && h.pendingRecords > 0, "cloud_ack_stale", "warning"],
    [!positionAvailable && h.locationAgeMs !== null && h.locationAgeMs >= staleLimit, "position_unavailable", "warning"]
  ];
  for (const [failed, reason, severity] of checks) {
    if (failed) return { status: "degraded", reason, positionAvailable, severity };
  }
  return { status: "healthy", reason: "ok", positionAvailable, severity: "info" };
}

function incidentDetail(h: DeviceHealth, classification: HealthClassification) {
  return JSON.stringify({
    reason: classification.reason,
    network: h.network,
    locationEnabled: h.locationEnabled,
    locationSubscribed: h.locationSubscribed,
    fineLocationPermission: h.fineLocationPermission ?? null,
    backgroundLocationPermission: h.backgroundLocationPermission ?? null,
    activityRecognitionPermission: h.activityRecognitionPermission ?? null,
    batteryOptimizationExempt: h.batteryOptimizationExempt ?? null,
    backgroundRestricted: h.backgroundRestricted ?? null,
    networkValidated: h.networkValidated ?? null,
    safetyOutboxWriteHealthy: h.safetyOutboxWriteHealthy ?? null,
    lastSafetyOutboxWriteFailureAgeMs: h.lastSafetyOutboxWriteFailureAgeMs ?? null,
    journalWriteHealthy: h.journalWriteHealthy ?? null,
    lastJournalWriteFailureAgeMs: h.lastJournalWriteFailureAgeMs ?? null,
    pendingRecords: h.pendingRecords,
    pendingSafetyEvents: h.pendingSafetyEvents ?? 0,
    oldestPendingAgeMs: h.oldestPendingAgeMs,
    locationAgeMs: h.locationAgeMs,
    ackAgeMs: h.ackAgeMs,
    recoveryCount: h.recoveryCount,
    appVersion: h.appVersion
  });
}

export async function recordHealthObservation(env: OpsEnv, deviceId: string, h: DeviceHealth, now: number) {
  const classification = classifyHealth(h);
  const detail = incidentDetail(h, classification);
  // Backend Queue/DLQ incidents are server-side. A healthy child heartbeat must never close one;
  // only successful backend reprocessing is allowed to mark backend_processing_failed recovered.
  const open = await env.DB.prepare(
    "SELECT id,kind,severity,started_at,last_seen_at,ended_at,alerted_at,auto_recovered,detail_json FROM health_incidents WHERE device_id=?1 AND ended_at IS NULL AND kind<>'backend_processing_failed' ORDER BY started_at DESC LIMIT 1"
  ).bind(deviceId).first<Incident>();

  const statements = [
    env.DB.prepare(
      "INSERT INTO device_health_samples(device_id,received_at,service_active,location_enabled,location_subscribed,fine_location_permission,background_location_permission,activity_recognition_permission,battery_optimization_exempt,background_restricted,network,network_validated,power_save_mode,pending_records,pending_safety_events,oldest_pending_age_ms,location_age_ms,ack_age_ms,battery_pct,charging,recovery_count,position_available,health_status,health_reason,app_version) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25)"
    ).bind(
      deviceId, now, flag(h.serviceActive) ?? 1, flag(h.locationEnabled) ?? 0, flag(h.locationSubscribed) ?? 0,
      flag(h.fineLocationPermission), flag(h.backgroundLocationPermission), flag(h.activityRecognitionPermission),
      flag(h.batteryOptimizationExempt), flag(h.backgroundRestricted), h.network, flag(h.networkValidated), flag(h.powerSaveMode),
      h.pendingRecords, h.pendingSafetyEvents ?? 0, nullableNumber(h.oldestPendingAgeMs), nullableNumber(h.locationAgeMs), nullableNumber(h.ackAgeMs),
      nullableNumber(h.batteryPct), flag(h.charging), h.recoveryCount, classification.positionAvailable ? 1 : 0,
      classification.status, classification.reason, h.appVersion
    )
  ];

  if (classification.status === "healthy") {
    if (open) statements.push(env.DB.prepare(
      "UPDATE health_incidents SET ended_at=?1,last_seen_at=?1,auto_recovered=1 WHERE id=?2 AND ended_at IS NULL"
    ).bind(now, open.id));
  } else if (!open) {
    statements.push(env.DB.prepare(
      "INSERT INTO health_incidents(id,device_id,kind,severity,started_at,last_seen_at,detail_json) VALUES(?1,?2,?3,?4,?5,?5,?6)"
    ).bind(crypto.randomUUID(), deviceId, classification.reason, classification.severity, now, detail));
  } else if (open.kind === classification.reason) {
    statements.push(env.DB.prepare(
      "UPDATE health_incidents SET last_seen_at=?1,severity=?2,detail_json=?3 WHERE id=?4 AND ended_at IS NULL"
    ).bind(now, classification.severity, detail, open.id));
  } else {
    statements.push(
      env.DB.prepare("UPDATE health_incidents SET ended_at=?1,last_seen_at=?1,auto_recovered=1 WHERE id=?2 AND ended_at IS NULL").bind(now, open.id),
      env.DB.prepare("INSERT INTO health_incidents(id,device_id,kind,severity,started_at,last_seen_at,detail_json) VALUES(?1,?2,?3,?4,?5,?5,?6)")
        .bind(crypto.randomUUID(), deviceId, classification.reason, classification.severity, now, detail)
    );
  }

  await env.DB.batch(statements);
  return classification;
}

export async function listHealthIncidents(env: OpsEnv, deviceId: string, limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const r = await env.DB.prepare(
    "SELECT id,kind,severity,started_at,last_seen_at,ended_at,alerted_at,auto_recovered,detail_json FROM health_incidents WHERE device_id=?1 ORDER BY started_at DESC LIMIT ?2"
  ).bind(deviceId, safeLimit).all();
  return json({ incidents: r.results });
}

export async function reliability(env: OpsEnv, deviceId: string, days = 30) {
  const safeDays = Math.max(1, Math.min(30, Math.trunc(days)));
  const now = Date.now();
  const requestedStart = now - safeDays * 86_400_000;
  const device = await env.DB.prepare("SELECT created_at FROM devices WHERE id=?1").bind(deviceId).first<{ created_at: number }>();
  if (!device) return json({ error: "device not found" }, 404);
  const start = Math.max(requestedStart, device.created_at);
  const totalMs = Math.max(1, now - start);
  const heartbeatLimit = 75_000;

  const coverage = await env.DB.prepare(`
    WITH ordered AS (
      SELECT received_at, position_available,
             LEAD(received_at,1,?3) OVER (ORDER BY received_at) AS next_at
      FROM device_health_samples
      WHERE device_id=?1 AND received_at>=?2 AND received_at<=?3
    ), spans AS (
      SELECT
        MAX(received_at,?4) AS span_start,
        MIN(next_at,received_at+?5,?3) AS span_end,
        position_available
      FROM ordered
    )
    SELECT
      COALESCE(SUM(MAX(0,span_end-span_start)),0) AS heartbeat_ms,
      COALESCE(SUM(CASE WHEN position_available=1 THEN MAX(0,span_end-span_start) ELSE 0 END),0) AS position_ms
    FROM spans
  `).bind(deviceId, start - heartbeatLimit, now, start, heartbeatLimit).first<{ heartbeat_ms: number; position_ms: number }>();

  const epochs = await env.DB.prepare(
    "SELECT epoch,MIN(sequence) AS min_seq,MAX(sequence) AS max_seq,COUNT(*) AS received FROM device_events WHERE device_id=?1 AND kind='location' AND created_at>=?2 AND created_at<=?3 GROUP BY epoch"
  ).bind(deviceId, start, now).all<{ epoch: number; min_seq: number; max_seq: number; received: number }>();
  let expectedPackets = 0, receivedPackets = 0, sequenceDiscontinuity = false;
  // Signed epoch/sequence counters can jump after reboot or damaged local state. A jump
  // of billions is not evidence billions of packets were ever generated. Cap the
  // inferable denominator at a deliberately generous 3 packets/sec for this window,
  // with a 1m floor for short windows, and report the metric as unknown if exceeded.
  const maxEvidenceSpan = Math.max(1_000_000, Math.ceil(totalMs / 1000) * 3);
  for (const row of epochs.results) {
    receivedPackets += row.received;
    const expected = row.max_seq - row.min_seq + 1;
    if (!Number.isSafeInteger(expected) || expected < 0 || expected > maxEvidenceSpan) {
      sequenceDiscontinuity = true;
      continue;
    }
    expectedPackets += expected;
  }

  const recovery = await env.DB.prepare(
    "SELECT MIN(recovery_count) AS first_count,MAX(recovery_count) AS last_count FROM device_health_samples WHERE device_id=?1 AND received_at>=?2 AND received_at<=?3"
  ).bind(deviceId, start, now).first<{ first_count: number | null; last_count: number | null }>();
  const incidentCount = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM health_incidents WHERE device_id=?1 AND started_at<=?3 AND COALESCE(ended_at,?3)>=?2"
  ).bind(deviceId, start, now).first<{ n: number }>();

  const heartbeatMs = Math.min(totalMs, Number(coverage?.heartbeat_ms ?? 0));
  const positionMs = Math.min(totalMs, Number(coverage?.position_ms ?? 0));
  const packetDeliveryPct = !sequenceDiscontinuity && expectedPackets > 0 ? Math.min(100, receivedPackets / expectedPackets * 100) : null;
  const selfRecoveries = recovery?.first_count == null || recovery?.last_count == null ? null : Math.max(0, recovery.last_count - recovery.first_count);

  return json({
    window: { days: safeDays, from: start, to: now, measuredMs: totalMs },
    trackingAvailabilityPct: heartbeatMs / totalMs * 100,
    positionAvailabilityPct: positionMs / totalMs * 100,
    packetDeliveryPct,
    packetEvidence: sequenceDiscontinuity ? { expectedPackets: null, receivedPackets, sequenceDiscontinuity: true } : { expectedPackets, receivedPackets },
    selfRecoveries,
    healthIncidents: incidentCount?.n ?? 0,
    manualInterventions: null,
    definitions: {
      trackingAvailability: "Time covered by a Brick health heartbeat no more than 75 seconds old.",
      positionAvailability: "Time covered by a heartbeat reporting a usable recent position.",
      packetDelivery: "Unique received location sequences divided by an inferable observed sequence range per epoch; extreme discontinuities yield unknown rather than invented packet loss.",
      manualInterventions: "Not measured yet; Brick does not invent this value."
    }
  });
}

export async function openOfflineIncident(env: OpsEnv, deviceId: string, startedAt: number, now: number) {
  // Device connectivity state and backend Queue processing state can fail independently. Never
  // auto-close or replace the server-side backend incident when the phone itself goes offline.
  const open = await env.DB.prepare(
    "SELECT id,kind FROM health_incidents WHERE device_id=?1 AND ended_at IS NULL AND kind<>'backend_processing_failed' ORDER BY started_at DESC LIMIT 1"
  ).bind(deviceId).first<{ id: string; kind: string }>();
  if (open?.kind === "device_offline") {
    await env.DB.prepare("UPDATE health_incidents SET last_seen_at=?1 WHERE id=?2").bind(now, open.id).run();
    return open.id;
  }
  const id = crypto.randomUUID();
  const statements = [];
  if (open) statements.push(env.DB.prepare("UPDATE health_incidents SET ended_at=?1,last_seen_at=?1 WHERE id=?2 AND ended_at IS NULL").bind(startedAt, open.id));
  statements.push(env.DB.prepare(
    "INSERT INTO health_incidents(id,device_id,kind,severity,started_at,last_seen_at,detail_json) VALUES(?1,?2,'device_offline','critical',?3,?4,?5)"
  ).bind(id, deviceId, startedAt, now, JSON.stringify({ reason: "device_offline" })));
  await env.DB.batch(statements);
  return id;
}

export async function alertPersistentIncidents(env: OpsEnv, now = Date.now()): Promise<Array<{ deviceId: string; event: RealtimeSafetyEvent }>> {
  const r = await env.DB.prepare(
    "SELECT id,device_id,kind,severity,started_at,detail_json FROM health_incidents WHERE ended_at IS NULL AND alerted_at IS NULL AND started_at<=?1 ORDER BY started_at,id LIMIT 100"
  ).bind(now - 60_000).all<{ id: string; device_id: string; kind: string; severity: string; started_at: number; detail_json: string }>();
  const out: Array<{ deviceId: string; event: RealtimeSafetyEvent }> = [];
  for (const row of r.results) {
    const event: RealtimeSafetyEvent = {
      // Each backend incident has one stable alert identity even when cron invocations
      // take the same unalerted D1 snapshot concurrently or retry after timeout.
      id: "inc_" + row.id,
      kind: row.kind === "device_offline" ? "device_offline" : "service_unhealthy",
      deviceCreatedAt: now,
      serverCreatedAt: now,
      latitude: null,
      longitude: null,
      accuracyM: null,
      detail: { incidentId: row.id, reason: row.kind, severity: row.severity }
    };
    const detail = JSON.stringify(event.detail);
    const [inserted] = await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO safety_events(id,device_id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json) VALUES(?1,?2,?3,?4,?4,NULL,NULL,NULL,?5)")
        .bind(event.id, row.device_id, event.kind, now, detail),
      env.DB.prepare("UPDATE health_incidents SET alerted_at=?1 WHERE id=?2 AND alerted_at IS NULL").bind(now, row.id)
    ]);
    if ((inserted.meta.changes ?? 0) > 0) out.push({ deviceId: row.device_id, event });
  }
  return out;
}

export async function cleanupOps(env: OpsEnv, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM device_health_samples WHERE rowid IN(SELECT rowid FROM device_health_samples WHERE received_at<?1 ORDER BY received_at,rowid LIMIT 200)").bind(now - 35 * 86_400_000),
    env.DB.prepare("DELETE FROM health_incidents WHERE rowid IN(SELECT rowid FROM health_incidents WHERE ended_at IS NOT NULL AND ended_at<?1 ORDER BY ended_at,rowid LIMIT 200)").bind(now - 365 * 86_400_000)
  ]);
}
