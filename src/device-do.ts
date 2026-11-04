import { DurableObject } from "cloudflare:workers";
import { activityName, qualityName, sourceName, type LivePacket, type RouteCorridor } from "./protocol";
import { shouldAdvanceLiveState } from "./live-state-order";

type Env = Record<string, never>;

export type DeviceHealth = {
  protocol: number;
  elapsedRealtimeMs: number;
  serviceUptimeMs: number;
  locationAgeMs: number | null;
  ackAgeMs: number | null;
  pendingRecords: number;
  pendingSafetyEvents?: number;
  oldestPendingAgeMs: number | null;
  network: "wifi" | "mobile" | "other" | "offline";
  locationEnabled: boolean;
  locationSubscribed: boolean;
  managed: boolean;
  recoveryCount: number;
  appVersion: string;
  healthSequence?: number;
  healthSentAtMs?: number;
  healthCounterWriteHealthy?: boolean;
  activityMode?: string;
  activityConfidence?: number;
  trackingIntervalMs?: number;
  gnssUsedInFix?: number;
  gnssTotal?: number;
  batteryPct?: number;
  charging?: boolean;
  sosActive?: boolean;
  serviceActive?: boolean;
  fineLocationPermission?: boolean;
  backgroundLocationPermission?: boolean;
  activityRecognitionPermission?: boolean;
  bleAnchorConfigCount?: number;
  bluetoothScanPermission?: boolean;
  notificationPermission?: boolean;
  batteryOptimizationExempt?: boolean;
  powerSaveMode?: boolean;
  backgroundRestricted?: boolean;
  networkValidated?: boolean;
  dataSaverRestricted?: boolean;
  accelerometerAvailable?: boolean;
  gyroscopeAvailable?: boolean;
  rotationVectorAvailable?: boolean;
  stepCounterAvailable?: boolean;
  stepDetectorAvailable?: boolean;
  lastSelfRecoveryAgeMs?: number | null;
  journalWriteHealthy?: boolean;
  lastJournalWriteFailureAgeMs?: number | null;
  safetyOutboxWriteHealthy?: boolean;
  lastSafetyOutboxWriteFailureAgeMs?: number | null;
  operationalStatus?: "healthy" | "degraded";
  operationalReason?: string;
  [key: string]: unknown;
};

export type NetworkEvidence = { country: string | null; region: string | null; city: string | null; colo: string | null; receivedAt: number };
export type RealtimeSafetyEvent = { id:string; kind:string; deviceCreatedAt:number; serverCreatedAt:number; latitude:number|null; longitude:number|null; accuracyM:number|null; detail:Record<string,unknown> };
export type LiveTraceInput = {
  id: string;
  sourceWallMs: number | null;
  persistedWallMs: number | null;
  persistDurationMs: number | null;
  sendWallMs: number | null;
  backendReceivedAtMs: number;
};

type StoredHealth = DeviceHealth & { receivedAt: number };
type SequenceHighWater = { epoch: number; sequence: number };
type LatestState = {
  epoch: number; sequence: number; lat: number | null; lon: number | null; uncertaintyM: number;
  routeCorridor: RouteCorridor | null;
  raw: { lat: number; lon: number; accuracyM: number | null; accepted: boolean; mock: boolean } | null;
  speedKph: number | null; speedAccuracyKph: number | null; bearingDeg: number | null; bearingAccuracyDeg: number | null;
  altitudeM: number | null; verticalAccuracyM: number | null; activity: string; activityConfidence: number;
  quality: string; source: string; rawAccepted: boolean; rawMock: boolean; batteryPct: number; charging: boolean;
  wallTimeMs: number; receivedAt: number;
  liveTrace?: LiveTraceInput & { doUpdatedAtMs: number };
};
type StoredSafetyEvent = RealtimeSafetyEvent & { receivedAt: number };

function newer(epoch: number, sequence: number, current: SequenceHighWater | null) {
  return current === null || epoch > current.epoch || (epoch === current.epoch && sequence > current.sequence);
}

export class BrickDevice extends DurableObject<Env> {
  private readonly MAX_SOCKET_LEASE_MS = 30_000;
  private revoked = false;
  private readonly initialized: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Also applies on hibernation and class reload: a revoked device never revives an old socket.
    this.initialized = this.ctx.storage.get<boolean>("wsRevoked").then(value => {
      this.revoked = value === true;
      if (this.revoked) this.closeAllParentSockets(4003, "Device revoked");
      else this.closeExpiredSockets();
    });
    this.ctx.waitUntil(this.initialized);
  }

  private deadline(ws: WebSocket): number {
    try {
      const value = ws.deserializeAttachment() as { v?: unknown; expiresAt?: unknown } | null;
      return value?.v === 1 && typeof value.expiresAt === "number" &&
        Number.isSafeInteger(value.expiresAt) ? value.expiresAt : 0;
    } catch { return 0; }
  }

  private closeAllParentSockets(code: number, reason: string) {
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.close(code, reason); } catch { /* revoked/expired socket cannot receive from broadcast */ }
    }
  }

  private closeExpiredSockets(now = Date.now()) {
    for (const ws of this.ctx.getWebSockets()) {
      if (this.deadline(ws) <= now) {
        try { ws.close(4001, "Subscription expired"); } catch { /* do not send to this socket */ }
      }
    }
  }

  private async scheduleExpiry() {
    if (this.revoked) return;
    const now = Date.now();
    let earliest = Number.POSITIVE_INFINITY;
    for (const ws of this.ctx.getWebSockets()) {
      const deadline = this.deadline(ws);
      if (deadline > now && deadline < earliest) earliest = deadline;
    }
    if (Number.isFinite(earliest)) {
      const existing = await this.ctx.storage.getAlarm();
      if (existing === null || existing > earliest) await this.ctx.storage.setAlarm(earliest);
    }
  }

  async alarm() {
    await this.initialized;
    this.closeExpiredSockets();
    await this.scheduleExpiry();
  }

  // Server-only RPC, invoked after durable D1 device revocation or valid development parent logout.
  async revokeParentSockets() {
    await this.initialized;
    this.revoked = true;
    // Persist the fence before closing: concurrent in-flight upgrades cannot resurrect live streams.
    await this.ctx.storage.put("wsRevoked", true);
    this.closeAllParentSockets(4003, "Subscription revoked");
  }

  private async broadcast(payload: unknown) {
    await this.initialized;
    if (this.revoked) return;
    this.closeExpiredSockets();
    const data = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      if (this.deadline(ws) <= Date.now()) continue;
      try { ws.send(data); } catch { try { ws.close(1011, "Subscription transport failed"); } catch {} }
    }
  }

  private async snapshotPayload() {
    const [latest, health, networkEvidence, lastSafetyEvent] = await Promise.all([
      this.ctx.storage.get<LatestState>("latest"), this.ctx.storage.get<StoredHealth>("health"),
      this.ctx.storage.get<NetworkEvidence>("networkEvidence"), this.ctx.storage.get<StoredSafetyEvent>("lastSafetyEvent")
    ]);
    return { type: "snapshot", latest: latest ?? null, state: latest ?? null, health: health ?? null, networkEvidence: networkEvidence ?? null, lastSafetyEvent: lastSafetyEvent ?? null };
  }

  private stateFor(packet: LivePacket, trace?: LiveTraceInput): LatestState {
    const doUpdatedAtMs = Date.now();
    return {
      epoch: packet.epoch,
      sequence: packet.sequence,
      lat: packet.trustedLatE7 === null ? null : packet.trustedLatE7 / 1e7,
      lon: packet.trustedLonE7 === null ? null : packet.trustedLonE7 / 1e7,
      uncertaintyM: packet.uncertaintyCm / 100,
      routeCorridor: packet.routeCorridor ?? null,
      raw: packet.rawLatE7 === null || packet.rawLonE7 === null ? null : {
        lat: packet.rawLatE7 / 1e7, lon: packet.rawLonE7 / 1e7,
        accuracyM: packet.rawAccuracyCm === null ? null : packet.rawAccuracyCm / 100,
        accepted: packet.rawAccepted, mock: packet.rawMock
      },
      speedKph: packet.speedCms === null ? null : packet.speedCms * 0.036,
      speedAccuracyKph: packet.speedAccuracyCms === null ? null : packet.speedAccuracyCms * 0.036,
      bearingDeg: packet.bearingCdeg === null ? null : packet.bearingCdeg / 100,
      bearingAccuracyDeg: packet.bearingAccuracyCdeg === null ? null : packet.bearingAccuracyCdeg / 100,
      altitudeM: packet.altitudeCm === null ? null : packet.altitudeCm / 100,
      verticalAccuracyM: packet.verticalAccuracyCm === null ? null : packet.verticalAccuracyCm / 100,
      activity: activityName(packet.activity), activityConfidence: packet.activityConfidence,
      quality: qualityName(packet.quality), source: sourceName(packet.source), rawAccepted: packet.rawAccepted, rawMock: packet.rawMock,
      batteryPct: packet.batteryPct, charging: packet.charging, wallTimeMs: packet.wallTimeMs, receivedAt: doUpdatedAtMs,
      ...(trace ? { liveTrace: { ...trace, doUpdatedAtMs } } : {})
    };
  }

  private async commitLatest(packet: LivePacket, trace?: LiveTraceInput): Promise<{ advanced: boolean; doUpdatedAtMs: number }> {
    const state = this.stateFor(packet, trace);
    const advanced = await this.ctx.storage.transaction(async txn => {
      const current = await txn.get<LatestState>("latest");
      if (!shouldAdvanceLiveState(state, current)) return false;
      await txn.put("latest", state);
      return true;
    });
    if (advanced) await this.broadcast({ type: "location", state });
    return { advanced, doUpdatedAtMs: state.liveTrace?.doUpdatedAtMs ?? state.receivedAt };
  }

  async setLatest(packet: LivePacket): Promise<boolean> { return (await this.commitLatest(packet)).advanced; }
  async setLatestWithTrace(packet: LivePacket, trace: LiveTraceInput): Promise<{ advanced: boolean; doUpdatedAtMs: number }> {
    return this.commitLatest(packet, trace);
  }

  async setHealth(health: DeviceHealth) {
    const stored: StoredHealth = { ...health, receivedAt: Date.now() };
    await this.ctx.storage.put("health", stored);
    await this.broadcast({ type: "health", health: stored });
  }
  async setNetworkEvidence(network: NetworkEvidence) { await this.ctx.storage.put("networkEvidence", network); await this.broadcast({ type: "networkEvidence", networkEvidence: network }); }
  async pushSafetyEvent(event: RealtimeSafetyEvent) { const stored: StoredSafetyEvent = { ...event, receivedAt: Date.now() }; await this.ctx.storage.put("lastSafetyEvent", stored); await this.broadcast({ type: "safety_event", event: stored }); }
  async readSequenceHighWater(): Promise<SequenceHighWater | null> { return (await this.ctx.storage.get<SequenceHighWater>("sequenceHighWater")) ?? null; }
  async commitSequenceHighWater(epoch: number, sequence: number) { const current = await this.readSequenceHighWater(); if (newer(epoch, sequence, current)) await this.ctx.storage.put("sequenceHighWater", { epoch, sequence }); }
  async canEvaluateSafety(epoch: number, sequence: number): Promise<boolean> { const current = (await this.ctx.storage.get<SequenceHighWater>("safetyEvaluationHighWater")) ?? null; return newer(epoch, sequence, current); }
  async commitSafetyEvaluation(epoch: number, sequence: number) { const current = (await this.ctx.storage.get<SequenceHighWater>("safetyEvaluationHighWater")) ?? null; if (newer(epoch, sequence, current)) await this.ctx.storage.put("safetyEvaluationHighWater", { epoch, sequence }); }
  async readSafetyHighWater(): Promise<number> { return (await this.ctx.storage.get<number>("safetyHighWater")) ?? 0; }
  async commitSafetyHighWater(sequence: number) { const current = await this.readSafetyHighWater(); if (sequence > current) await this.ctx.storage.put("safetyHighWater", sequence); }

  async fetch(req: Request): Promise<Response> {
    const u = new URL(req.url);
    if (u.pathname === "/state") {
      const snapshot = await this.snapshotPayload();
      return Response.json({ latest: snapshot.latest, state: snapshot.state, health: snapshot.health, networkEvidence: snapshot.networkEvidence, network: snapshot.networkEvidence, lastSafetyEvent: snapshot.lastSafetyEvent });
    }
    if (u.pathname === "/ws") {
      await this.initialized;
      if (this.revoked) return new Response("Subscription revoked", { status: 410 });
      const now = Date.now();
      const rawUntil = req.headers.get("X-Brick-Internal-Ws-Lease-Until");
      const expiresAt = rawUntil === null ? NaN : Number(rawUntil);
      if (req.method !== "GET" || req.headers.get("Upgrade")?.toLowerCase() !== "websocket" ||
          !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + this.MAX_SOCKET_LEASE_MS) {
        return new Response("Valid parent WebSocket lease required", { status: 403 });
      }
      // Arm the idle alarm BEFORE accepting a socket; failed alarm storage must fail closed.
      const currentAlarm = await this.ctx.storage.getAlarm();
      if (currentAlarm === null || currentAlarm > expiresAt) await this.ctx.storage.setAlarm(expiresAt);
      if (this.revoked) return new Response("Subscription revoked", { status: 410 });
      const pair = new WebSocketPair(); const client = pair[0], server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ v: 1, expiresAt });
      this.ctx.waitUntil(this.snapshotPayload().then(snapshot => {
        if (this.revoked || this.deadline(server) <= Date.now()) {
          try { server.close(4001, "Subscription expired"); } catch {}
          return;
        }
        try { server.send(JSON.stringify(snapshot)); } catch { try { server.close(1011, "Snapshot failed"); } catch {} }
      }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("Not found", { status: 404 });
  }
  webSocketClose(_ws: WebSocket) { /* Hibernation API owns socket lifecycle. */ }
  webSocketError(_ws: WebSocket) { /* Expiry alarm / next broadcast prunes failed sockets. */ }
}
