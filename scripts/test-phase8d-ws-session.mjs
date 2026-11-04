// Phase 8D P8D-011 negative regression: real BrickDevice behavior under a
// deterministic Cloudflare DO/WebSocket API simulation, no live user data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const built = process.argv[2];
assert.ok(built, "Pass esbuild's bundled BrickDevice module path");
const { BrickDevice } = await import(pathToFileURL(built).href);

const NativeResponse = globalThis.Response;
globalThis.Response = class TestResponse {
  constructor(body, init = {}) { this.status = init.status ?? 200; this.body = body; this.webSocket = init.webSocket; }
  static json(value, init) { return NativeResponse.json(value, init); }
};
class TestSocket {
  closed = false;
  sent = [];
  reason = null;
  attachment = null;
  send(data) { if (this.closed) throw Error("closed"); this.sent.push(JSON.parse(data)); }
  close(code, reason) { this.closed = true; this.reason = reason; this.code = code; }
  serializeAttachment(data) { this.attachment = structuredClone(data); }
  deserializeAttachment() { return this.attachment; }
}
globalThis.WebSocketPair = class {
  constructor() { this[0] = new TestSocket(); this[1] = new TestSocket(); }
};
class Storage {
  data = new Map();
  nextAlarm = null;
  async get(key) { return this.data.get(key); }
  async put(key, value) { this.data.set(key, value); }
  async transaction(fn) { return fn(this); }
  async getAlarm() { return this.nextAlarm; }
  async setAlarm(t) { this.nextAlarm = t; }
}
class State {
  storage = new Storage();
  sockets = [];
  pending = [];
  getWebSockets() { return this.sockets.filter(s => !s.closed); }
  acceptWebSocket(ws) { this.sockets.push(ws); }
  waitUntil(promise) { this.pending.push(promise); }
  async drain() { await Promise.all(this.pending.splice(0)); }
}
const oldNow = Date.now;
let now = 1_800_000_000_000;
Date.now = () => now;
try {
  const ctx = new State(), device = new BrickDevice(ctx, {});
  const wsReq = headers => new Request("https://do/ws", { method: "GET", headers: { Upgrade: "websocket", ...headers } });

  // Direct/unauthorized DO upgrade and forged/unbounded grants must fail.
  assert.equal((await device.fetch(wsReq({}))).status, 403, "missing authenticated lease must be rejected");
  assert.equal((await device.fetch(wsReq({ "X-Brick-Internal-Ws-Lease-Until": "invalid" }))).status, 403);
  assert.equal((await device.fetch(wsReq({ "X-Brick-Internal-Ws-Lease-Until": String(now + 3_600_000) }))).status, 403);
  assert.equal(ctx.getWebSockets().length, 0);

  // Short authenticated lease accepted; snapshot sent, alarm armed and hibernation safe.
  const leaseUntil = now + 20_000;
  const opened = await device.fetch(wsReq({ "X-Brick-Internal-Ws-Lease-Until": String(leaseUntil) }));
  assert.equal(opened.status, 101);
  await ctx.drain();
  const socket = ctx.getWebSockets()[0];
  assert.ok(socket);
  assert.equal(socket.sent[0]?.type, "snapshot");
  assert.equal(ctx.storage.nextAlarm, leaseUntil, "idle socket must have an expiry alarm");
  const resumed = new BrickDevice(ctx, {}); // Cloudflare hibernation/reconstruction
  await resumed.setNetworkEvidence({ country: "SG", city: null, region: null, colo: null, receivedAt: now });
  assert.equal(socket.sent.at(-1).type, "networkEvidence");

  // Idle expiry must close socket even when there are no location broadcasts.
  now = leaseUntil + 1;
  await resumed.alarm();
  assert.equal(socket.closed, true, "expired socket still open");
  const count = socket.sent.length;
  await resumed.setNetworkEvidence({ country: "SG", city: null, region: null, colo: null, receivedAt: now });
  assert.equal(socket.sent.length, count, "expired socket received location data");

  // Device revocation and parent logout invalidate existing live streams, not just future upgrades.
  now += 1_000;
  const another = await resumed.fetch(wsReq({ "X-Brick-Internal-Ws-Lease-Until": String(now + 15_000) }));
  assert.equal(another.status, 101);
  await ctx.drain();
  const live = ctx.getWebSockets()[0];
  await resumed.revokeParentSockets();
  assert.equal(live.closed, true, "revoked account/device socket still open");
  await resumed.setNetworkEvidence({ country: "SG", city: null, region: null, colo: null, receivedAt: now });
  assert.equal(live.closed, true);

  // Pre-upgrade attachments are not trusted: migrated DO sessions must fail closed.
  const oldSocket = new TestSocket(); ctx.acceptWebSocket(oldSocket);
  await resumed.setNetworkEvidence({ country: "SG", city: null, region: null, colo: null, receivedAt: now });
  assert.equal(oldSocket.closed, true, "legacy unleased subscription not retired");
  assert.equal(oldSocket.sent.length, 0);

  const wrapper = readFileSync("src/worker-v5b.ts", "utf8");
  const proxy = readFileSync("src/index.ts", "utf8");
  const revocation = readFileSync("src/worker-v6.ts", "utf8");
  const dev = readFileSync("src/worker-v10.ts", "utf8");
  assert.match(wrapper, /verifyAccessRequest\(req, env\)/, "outer Worker must verify JWT/session before issuing lease");
  assert.match(wrapper, /X-Brick-Internal-Ws-Lease-Until/, "wrapper must issue bounded authenticated WS grant");
  assert.match(proxy, /X-Brick-Internal-Ws-Lease-Until/, "core proxy must forward only sanitized WS grant");
  assert.match(revocation, /revokeParentSockets\(/, "device revocation must close existing DO sockets");
  assert.match(dev, /revokeParentSockets\(/, "dev logout must close existing DO sockets");
  console.log("PASS P8D-011 short-lease auth, hibernation, idle expiry, revocation, legacy cleanup and route wiring");
} finally {
  Date.now = oldNow;
  globalThis.Response = NativeResponse;
}
