import { DurableObject } from "cloudflare:workers";
import type { LivePacket } from "./protocol";

export type DeviceHealth = {
  protocol: number;
  elapsedRealtimeMs: number;
  serviceUptimeMs: number;
  locationAgeMs: number | null;
  ackAgeMs: number | null;
  pendingRecords: number;
  oldestPendingAgeMs: number | null;
  network: "wifi" | "mobile" | "other" | "offline";
  locationEnabled: boolean;
  locationSubscribed: boolean;
  managed: boolean;
  recoveryCount: number;
  appVersion: string;
};

type StoredHealth = DeviceHealth & { receivedAt: number };
type LatestState = {
  epoch: number;
  sequence: number;
  lat: number;
  lon: number;
  accuracyM: number;
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
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + 15_000);
    }
  }

  private async derive(now = Date.now()): Promise<Derived> {
    const latest = await this.ctx.storage.get<LatestState>("latest");
    const health = await this.ctx.storage.get<StoredHealth>("health");
    const heartbeatAge = health ? now - health.receivedAt : Number.POSITIVE_INFINITY;
    const positionAge = latest ? now - latest.receivedAt : Number.POSITIVE_INFINITY;

    const deviceStatus: Derived["deviceStatus"] = !health
      ? "unknown"
      : heartbeatAge <= 45_000
        ? "healthy"
        : heartbeatAge <= 75_000
          ? "degraded"
          : "offline";

    const positionStatus: Derived["positionStatus"] = !latest
      ? "unknown"
      : positionAge <= 15_000
        ? "fresh"
        : positionAge <= 60_000
          ? "stale"
          : "unavailable";

    return { deviceStatus, positionStatus, evaluatedAt: now };
  }

  private async snapshot() {
    const [latest, health, derived] = await Promise.all([
      this.ctx.storage.get<LatestState>("latest"),
      this.ctx.storage.get<StoredHealth>("health"),
      this.derive()
    ]);
    return { latest: latest ?? null, health: health ?? null, derived };
  }

  private broadcast(type: string, payload: unknown) {
    const msg = JSON.stringify({ type, ...((payload && typeof payload === "object") ? payload : { payload }) });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch { try { ws.close(1011, "send failed"); } catch {} }
    }
  }

  async setLatest(packet: LivePacket) {
    const state: LatestState = {
      epoch: packet.epoch,
      sequence: packet.sequence,
      lat: packet.latE7 / 1e7,
      lon: packet.lonE7 / 1e7,
      accuracyM: packet.accuracyCm / 100,
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
    if (url.pathname.endsWith("/state")) {
      return Response.json(await this.snapshot());
    }
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
    // Parent channel is server-push only. Ignore client data except a tiny ping.
    if (typeof message === "string" && message === "ping") ws.send("pong");
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try { ws.close(code, reason); } catch {}
  }

  async webSocketError(ws: WebSocket) {
    try { ws.close(1011, "websocket error"); } catch {}
  }
}
