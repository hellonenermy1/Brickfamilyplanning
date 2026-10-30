import { DurableObject } from "cloudflare:workers";
import type { LivePacket } from "./protocol";

export class BrickDevice extends DurableObject {
  private sockets = new Set<WebSocket>();

  async setLatest(packet: LivePacket) {
    const state = {
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
    const msg = JSON.stringify({ type: "location", state });
    for (const ws of this.sockets) {
      try { ws.send(msg); } catch { this.sockets.delete(ws); }
    }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.endsWith("/state")) {
      return Response.json(await this.ctx.storage.get("latest") ?? null);
    }
    if (url.pathname.endsWith("/ws")) {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected websocket", { status: 426 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sockets.add(server);
      server.addEventListener("close", () => this.sockets.delete(server));
      server.addEventListener("error", () => this.sockets.delete(server));
      const latest = await this.ctx.storage.get("latest");
      if (latest) server.send(JSON.stringify({ type: "location", state: latest }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("Not found", { status: 404 });
  }
}
