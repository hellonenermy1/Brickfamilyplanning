import { DurableObject } from "cloudflare:workers";
import { activityName, qualityName, sourceName, type LivePacket } from "./protocol";

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
  activityMode?: string;
  activityConfidence?: number;
  trackingIntervalMs?: number;
  gnssUsedInFix?: number;
  gnssTotal?: number;
  batteryPct?: number;
  charging?: boolean;
  sosActive?: boolean;
};

export type NetworkEvidence = {
  country: string | null;
  region: string | null;
  city: string | null;
  colo: string | null;
  receivedAt: number;
};

export type RealtimeSafetyEvent = {
  id: string;
  kind: string;
  deviceCreatedAt: number;
  serverCreatedAt: number;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  detail: Record<string, unknown>;
};

type StoredHealth = DeviceHealth & { receivedAt: number };
type LatestState = {
  epoch: number;
  sequence: number;
  lat: number | null;
  lon: number | null;
  uncertaintyM: number;
  raw: { lat: number; lon: number; accuracyM: number | null; accepted: boolean; mock: boolean } | null;
  speedKph: number | null;
  speedAccuracyKph: number | null;
  bearingDeg: number | null;
  bearingAccuracyDeg: number | null;
  altitudeM: number | null;
  verticalAccuracyM: number | null;
  activity: string;
  activityConfidence: number;
  quality: string;
  source: string;
  gnss: { usedInFix: number; total: number; averageCn0DbHz: number | null };
  fallback: boolean;
  batteryPct: number;
  charging: boolean;
  wallTimeMs: number;
  receivedAt: number;
};

type Derived = {
  deviceStatus: "healthy" | "degraded" | "offline" | "unknown";
  positionStatus: "fresh" | "stale" | "unavailable" | "unknown";
  evaluatedAt: number;
};

export class BrickDevice extends DurableObject {
  private async ensureWatchdog() {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + 15_000);
  }

  private async derive(now = Date.now()): Promise<Derived> {
    const latest = await this.ctx.storage.get<LatestState>("latest");
    const health = await this.ctx.storage.get<StoredHealth>("health");
    const heartbeatAge = health ? now - health.receivedAt : Number.POSITIVE_INFINITY;
    const positionAge = latest ? now - latest.receivedAt : Number.POSITIVE_INFINITY;

    const deviceStatus: Derived["deviceStatus"] = !health
      ? "unknown"
      : heartbeatAge <= 45_000 ? "healthy" : heartbeatAge <= 75_000 ? "degraded" : "offline";

    const interval = Math.min(Math.max(health?.trackingIntervalMs ?? 5_000, 3_000), 120_000);
    const freshLimit = Math.max(15_000, interval * 2.5);
    const staleLimit = Math.max(60_000, interval * 3 + 30_000);

    const positionStatus: Derived["positionStatus"] = !latest
      ? "unknown"
      : latest.lat === null || latest.lon === null
        ? "unavailable"
        : positionAge <= freshLimit ? "fresh" : positionAge <= staleLimit ? "stale" : "unavailable";

    return { deviceStatus, positionStatus, evaluatedAt: now };
  }

  private async snapshot() {
    const [latest, health, networkEvidence, derived, latestSafetyEvent] = await Promise.all([
      this.ctx.storage.get<LatestState>("latest"),
      this.ctx.storage.get<StoredHealth>("health"),
      this.ctx.storage.get<NetworkEvidence>("networkEvidence"),
      this.derive(),
      this.ctx.storage.get<RealtimeSafetyEvent>("latestSafetyEvent")
    ]);
    return {
      latest: latest ?? null,
      health: health ?? null,
      networkEvidence: networkEvidence ?? null,
      latestSafetyEvent: latestSafetyEvent ?? null,
      derived
    };
  }

  private broadcast(type: string, payload: unknown) {
    const msg = JSON.stringify({ type, ...((payload && typeof payload === "object") ? payload : { payload }) });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch { try { ws.close(1011, "send failed"); } catch {} }
    }
  }

  async setLatest(packet: LivePacket) {
    const raw = packet.rawLatE7 !== null && packet.rawLonE7 !== null ? {
      lat: packet.rawLatE7 / 1e7,
      lon: packet.rawLonE7 / 1e7,
      accuracyM: packet.rawAccuracyCm === null ? null : packet.rawAccuracyCm / 100,
      accepted: packet.rawAccepted,
      mock: packet.rawMock
    } : null;

    const state: LatestState = {
      epoch: packet.epoch,
      sequence: packet.sequence,
      lat: packet.trustedLatE7 === null ? null : packet.trustedLatE7 / 1e7,
      lon: packet.trustedLonE7 === null ? null : packet.trustedLonE7 / 1e7,
      uncertaintyM: packet.uncertaintyCm / 100,
      raw,
      speedKph: packet.speedCms === null ? null : packet.speedCms * 0.036,
      speedAccuracyKph: packet.speedAccuracyCms === null ? null : packet.speedAccuracyCms * 0.036,
      bearingDeg: packet.bearingCdeg === null ? null : packet.bearingCdeg / 100,
      bearingAccuracyDeg: packet.bearingAccuracyCdeg === null ? null : packet.bearingAccuracyCdeg / 100,
      altitudeM: packet.altitudeCm === null ? null : packet.altitudeCm / 100,
      verticalAccuracyM: packet.verticalAccuracyCm === null ? null : packet.verticalAccuracyCm / 100,
      activity: activityName(packet.activity),
      activityConfidence: packet.activityConfidence,
      quality: qualityName(packet.quality),
      source: sourceName(packet.source),
      gnss: {
        usedInFix: packet.gnssUsedInFix,
        total: packet.gnssTotal,
        averageCn0DbHz: packet.gnssAverageCn0Tenth > 0 ? packet.gnssAverageCn0Tenth / 10 : null
      },
      fallback: packet.fallback,
      batteryPct: packet.batteryPct,
      charging: packet.charging,
      wallTimeMs: packet.wallTimeMs,
      receivedAt: Date.now()
    };
    await this.ctx.storage.put("latest", state);
    await this.ensureWatchdog();
    this.broadcast("location", { state, derived: await this.derive() });
  }

  async setHealth(health: DeviceHealth) {
    const stored: StoredHealth = { ...health, receivedAt: Date.now() };
    await this.ctx.storage.put("health", stored);
    await this.ensureWatchdog();
    this.broadcast("health", { health: stored, derived: await this.derive() });
  }

  async setNetworkEvidence(evidence: NetworkEvidence) {
    await this.ctx.storage.put("networkEvidence", evidence);
    this.broadcast("networkEvidence", { networkEvidence: evidence, derived: await this.derive() });
  }

  async pushSafetyEvent(event: RealtimeSafetyEvent) {
    await this.ctx.storage.put("latestSafetyEvent", event);
    this.broadcast("safety_event", { event, derived: await this.derive() });
  }

  async alarm() {
    const previous = await this.ctx.storage.get<Derived>("derived");
    const derived = await this.derive();
    await this.ctx.storage.put("derived", derived);
    if (!previous || previous.deviceStatus !== derived.deviceStatus || previous.positionStatus !== derived.positionStatus) {
      this.broadcast("status", { derived });
    }
    await this.ctx.storage.setAlarm(Date.now() + 15_000);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/state")) return Response.json(await this.snapshot());
    if (url.pathname.endsWith("/ws")) {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected websocket", { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: "snapshot", ...(await this.snapshot()) }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === "string" && message === "ping") ws.send("pong");
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) { try { ws.close(code, reason); } catch {} }
  async webSocketError(ws: WebSocket) { try { ws.close(1011, "websocket error"); } catch {} }
}
