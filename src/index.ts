import { BrickDevice, type DeviceHealth } from "./device-do";
import { decodeLivePacket } from "./protocol";
import { randomToken, sha256Hex, verifyDeviceSignature } from "./crypto";
export { BrickDevice };

type RateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
type Env = {
  DB: D1Database;
  HISTORY: R2Bucket;
  EVENTS: Queue;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
  DEVICE_RATE: RateLimit;
  PAIR_RATE: RateLimit;
  APP_ENV: string;
};

type PairStartBody = { name?: string };
type PairCompleteBody = { token?: string; publicKeySpkiB64?: string };

type DeviceRecord = { public_key_spki_b64: string; revoked_at: number | null };

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://unpkg.com; script-src 'self' https://unpkg.com; connect-src 'self' wss:; img-src 'self' data: https:; worker-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store"
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: securityHeaders });
}

function noStore(resp: Response) {
  const h = new Headers(resp.headers);
  Object.entries(securityHeaders).forEach(([k, v]) => h.set(k, v));
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
}

function parentAuthorized(req: Request): boolean {
  const url = new URL(req.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  return Boolean(req.headers.get("Cf-Access-Jwt-Assertion"));
}

async function parentOnly(req: Request) {
  if (!parentAuthorized(req)) return json({ error: "Cloudflare Access authentication required" }, 401);
  return null;
}

async function getAuthorizedDevice(env: Env, deviceId: string): Promise<DeviceRecord | null> {
  const device = await env.DB.prepare("SELECT public_key_spki_b64, revoked_at FROM devices WHERE id=?1")
    .bind(deviceId).first<DeviceRecord>();
  return device && !device.revoked_at ? device : null;
}

async function verifySignedPayload(req: Request, device: DeviceRecord, maxBytes: number): Promise<ArrayBuffer | Response> {
  const sig = req.headers.get("X-Brick-Signature");
  if (!sig || sig.length > 512) return json({ error: "missing or invalid signature" }, 401);
  const payload = await req.arrayBuffer();
  if (payload.byteLength === 0 || payload.byteLength > maxBytes) return json({ error: "invalid payload size" }, 400);
  if (!(await verifyDeviceSignature(device.public_key_spki_b64, payload, sig))) return json({ error: "bad signature" }, 401);
  return payload;
}

async function createPairing(req: Request, env: Env) {
  const denied = await parentOnly(req); if (denied) return denied;
  const rl = await env.PAIR_RATE.limit({ key: "parent-pair-start" });
  if (!rl.success) return json({ error: "rate limited" }, 429);
  const body: PairStartBody = await req.json<PairStartBody>().catch(() => ({}));
  const name = (body.name ?? "Child device").trim().slice(0, 64) || "Child device";
  const token = randomToken(24);
  const tokenHash = await sha256Hex(token);
  const expiresAt = Date.now() + 10 * 60_000;
  await env.DB.prepare("INSERT INTO pairing_tokens(token_hash, device_name, expires_at) VALUES(?1, ?2, ?3)")
    .bind(tokenHash, name, expiresAt).run();
  return json({ token, expiresAt });
}

async function completePairing(req: Request, env: Env) {
  const body: PairCompleteBody = await req.json<PairCompleteBody>().catch(() => ({}));
  if (!body.token || !body.publicKeySpkiB64) return json({ error: "missing fields" }, 400);
  const rl = await env.PAIR_RATE.limit({ key: `pair-complete:${body.token.slice(0, 12)}` });
  if (!rl.success) return json({ error: "rate limited" }, 429);
  if (body.publicKeySpkiB64.length > 2048) return json({ error: "bad public key" }, 400);

  const hash = await sha256Hex(body.token);
  const now = Date.now();
  const consumed = await env.DB.prepare(
    "UPDATE pairing_tokens SET consumed_at=?1 WHERE token_hash=?2 AND consumed_at IS NULL AND expires_at>=?1 RETURNING device_name"
  ).bind(now, hash).first<{ device_name: string }>();
  if (!consumed) return json({ error: "invalid or expired token" }, 400);

  const deviceId = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,?2,?3,?4)")
      .bind(deviceId, consumed.device_name, body.publicKeySpkiB64, now).run();
  } catch {
    return json({ error: "device registration failed; create a new pairing code" }, 500);
  }
  return json({ deviceId, apiBase: new URL(req.url).origin });
}

async function ingest(req: Request, env: Env, deviceId: string) {
  const rl = await env.DEVICE_RATE.limit({ key: deviceId });
  if (!rl.success) return json({ error: "rate limited" }, 429);
  const device = await getAuthorizedDevice(env, deviceId);
  if (!device) return json({ error: "device unauthorized" }, 401);
  const verified = await verifySignedPayload(req, device, 43);
  if (verified instanceof Response) return verified;
  if (verified.byteLength !== 43) return json({ error: "bad packet length" }, 400);

  let packet;
  try { packet = decodeLivePacket(verified); } catch (e) { return json({ error: String(e) }, 400); }
  const now = Date.now();

  const [firstSeen, advance] = await env.DB.batch([
    env.DB.prepare(
      "INSERT OR IGNORE INTO device_events(device_id,epoch,sequence,kind,created_at) VALUES(?1,?2,?3,'location',?4)"
    ).bind(deviceId, packet.epoch, packet.sequence, now),
    env.DB.prepare(
      "UPDATE devices SET last_epoch=?1,last_sequence=?2,last_seen_at=?3 WHERE id=?4 AND revoked_at IS NULL AND (last_epoch<?1 OR (last_epoch=?1 AND last_sequence<?2))"
    ).bind(packet.epoch, packet.sequence, now, deviceId)
  ]);

  const isNew = (firstSeen.meta.changes ?? 0) > 0;
  const isNewest = (advance.meta.changes ?? 0) > 0;
  if (isNew) await env.EVENTS.send({ type: "location", deviceId, packet });
  if (isNewest) {
    const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId));
    await stub.setLatest(packet);
  }
  return json({ ack: packet.sequence, duplicate: !isNew, liveAdvanced: isNewest });
}

function validHealth(x: unknown): x is DeviceHealth {
  if (!x || typeof x !== "object") return false;
  const h = x as Record<string, unknown>;
  const network = h.network;
  return h.protocol === 1 &&
    typeof h.elapsedRealtimeMs === "number" && h.elapsedRealtimeMs >= 0 &&
    typeof h.serviceUptimeMs === "number" && h.serviceUptimeMs >= 0 &&
    (h.locationAgeMs === null || (typeof h.locationAgeMs === "number" && h.locationAgeMs >= 0)) &&
    (h.ackAgeMs === null || (typeof h.ackAgeMs === "number" && h.ackAgeMs >= 0)) &&
    typeof h.pendingRecords === "number" && Number.isInteger(h.pendingRecords) && h.pendingRecords >= 0 && h.pendingRecords <= 10_000_000 &&
    (h.oldestPendingAgeMs === null || (typeof h.oldestPendingAgeMs === "number" && h.oldestPendingAgeMs >= 0)) &&
    (network === "wifi" || network === "mobile" || network === "other" || network === "offline") &&
    typeof h.locationEnabled === "boolean" && typeof h.locationSubscribed === "boolean" &&
    typeof h.managed === "boolean" && typeof h.recoveryCount === "number" && Number.isInteger(h.recoveryCount) && h.recoveryCount >= 0 &&
    typeof h.appVersion === "string" && h.appVersion.length <= 64;
}

async function ingestHealth(req: Request, env: Env, deviceId: string) {
  const rl = await env.DEVICE_RATE.limit({ key: `${deviceId}:health` });
  if (!rl.success) return json({ error: "rate limited" }, 429);
  const device = await getAuthorizedDevice(env, deviceId);
  if (!device) return json({ error: "device unauthorized" }, 401);
  const verified = await verifySignedPayload(req, device, 4096);
  if (verified instanceof Response) return verified;

  let health: unknown;
  try { health = JSON.parse(new TextDecoder().decode(verified)); } catch { return json({ error: "invalid health JSON" }, 400); }
  if (!validHealth(health)) return json({ error: "invalid health schema" }, 400);

  const now = Date.now();
  const status = health.locationEnabled && health.locationSubscribed ? "healthy" : "degraded";
  await env.DB.prepare(
    "UPDATE devices SET last_health_at=?1, health_status=?2, recovery_count=?3, pending_records=?4, app_version=?5 WHERE id=?6 AND revoked_at IS NULL"
  ).bind(now, status, health.recoveryCount, health.pendingRecords, health.appVersion, deviceId).run();

  const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId));
  await stub.setHealth(health);
  return json({ ok: true, receivedAt: now });
}

async function listDevices(req: Request, env: Env) {
  const denied = await parentOnly(req); if (denied) return denied;
  const result = await env.DB.prepare(
    "SELECT id,name,created_at,last_seen_at,last_health_at,health_status,recovery_count,pending_records,app_version,revoked_at FROM devices ORDER BY created_at DESC"
  ).all();
  return json({ devices: result.results });
}

async function parentDeviceProxy(req: Request, env: Env, deviceId: string, kind: "state" | "ws") {
  const denied = await parentOnly(req); if (denied) return denied;
  const exists = await env.DB.prepare("SELECT id FROM devices WHERE id=?1 AND revoked_at IS NULL").bind(deviceId).first();
  if (!exists) return json({ error: "device not found" }, 404);
  const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(deviceId));
  if (kind === "state") return noStore(await stub.fetch(new Request("https://do/state")));
  return stub.fetch(new Request("https://do/ws", { method: req.method, headers: req.headers }));
}

function parentHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brick Parent</title><link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.css"><style>html,body{margin:0;font-family:system-ui;background:#f4f6f8;color:#121417}header{height:56px;padding:0 20px;background:#fff;border-bottom:1px solid #e4e7eb;display:flex;align-items:center;justify-content:space-between}.wrap{display:grid;grid-template-columns:minmax(0,1fr) 350px;min-height:calc(100vh - 57px)}#map{min-height:540px}.panel{background:#fff;padding:20px;border-left:1px solid #e4e7eb}.row{display:flex;justify-content:space-between;gap:20px;padding:10px 0;border-bottom:1px solid #eef0f2}.muted{color:#69727d}.good{color:#177245}.warn{color:#a15c00}.bad{color:#b42318}button,input,select{font:inherit}button{cursor:pointer}input,select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cfd5dc;border-radius:8px}.primary{margin-top:8px;width:100%;padding:11px;border:0;border-radius:8px;background:#121417;color:white}pre{white-space:pre-wrap;word-break:break-all;background:#f5f6f7;padding:10px;border-radius:8px}@media(max-width:760px){.wrap{grid-template-columns:1fr}.panel{border-left:0;border-top:1px solid #ddd}#map{min-height:55vh}}</style></head><body><header><strong>BRICK</strong><span><b id="deviceHealth">DEVICE —</b> · <b id="positionHealth">POSITION —</b></span></header><div class="wrap"><div id="map"></div><aside class="panel"><label>Device</label><select id="devices"></select><h2 id="name">No device</h2><div class="row"><span>Accuracy</span><b id="accuracy">—</b></div><div class="row"><span>Battery</span><b id="battery">—</b></div><div class="row"><span>Charging</span><b id="charging">—</b></div><div class="row"><span>Network</span><b id="network">—</b></div><div class="row"><span>Pending records</span><b id="pending">—</b></div><div class="row"><span>Self-recoveries</span><b id="recoveries">—</b></div><div class="row"><span>App</span><b id="version">—</b></div><div class="row"><span>Updated</span><b id="updated">—</b></div><hr><h3>Pair device</h3><input id="pairName" value="Child phone" maxlength="64"><button id="pairBtn" class="primary">Create 10-minute pairing code</button><pre id="pairOut">—</pre></aside></div><script type="module">import maplibregl from 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs';const map=new maplibregl.Map({container:'map',style:'https://demotiles.maplibre.org/style.json',center:[103.8198,1.3521],zoom:11});let marker,ws,timer,current,last;const $=s=>document.querySelector(s);function statusEl(el,text,state){el.textContent=text;el.className=state==='healthy'||state==='fresh'?'good':state==='degraded'||state==='stale'?'warn':state==='unknown'?'muted':'bad'}function renderSnapshot(s){if(!s)return;last=s;const l=s.latest,h=s.health,d=s.derived||{};statusEl($('#deviceHealth'),'DEVICE '+String(d.deviceStatus||'unknown').toUpperCase(),d.deviceStatus);statusEl($('#positionHealth'),'POSITION '+String(d.positionStatus||'unknown').toUpperCase(),d.positionStatus);if(l){$('#accuracy').textContent='±'+l.accuracyM.toFixed(0)+' m';$('#battery').textContent=l.batteryPct+'%';$('#charging').textContent=l.charging?'Yes':'No';$('#updated').textContent=Math.max(0,Math.round((Date.now()-l.receivedAt)/1000))+' sec ago';const ll=[l.lon,l.lat];if(!marker){marker=new maplibregl.Marker().setLngLat(ll).addTo(map);map.flyTo({center:ll,zoom:16})}else marker.setLngLat(ll)}if(h){$('#network').textContent=h.network;$('#pending').textContent=h.pendingRecords;$('#recoveries').textContent=h.recoveryCount;$('#version').textContent=h.appVersion}}function mergeMessage(m){if(m.type==='snapshot'){renderSnapshot(m);return}const n=structuredClone(last||{latest:null,health:null,derived:{}});if(m.type==='location')n.latest=m.state;if(m.type==='health')n.health=m.health;if(m.derived)n.derived=m.derived;renderSnapshot(n)}async function connect(id){current=id;if(ws)ws.close();const proto=location.protocol==='https:'?'wss://':'ws://';ws=new WebSocket(proto+location.host+'/parent/api/device/'+encodeURIComponent(id)+'/ws');ws.onmessage=e=>mergeMessage(JSON.parse(e.data));ws.onclose=()=>{if(current===id)timer=setTimeout(()=>connect(id),1500)}}async function load(){const r=await fetch('/parent/api/devices');const j=await r.json();const sel=$('#devices');sel.innerHTML='';for(const d of j.devices||[]){const o=document.createElement('option');o.value=d.id;o.textContent=d.name;sel.appendChild(o)}if(sel.value){$('#name').textContent=sel.options[sel.selectedIndex].text;connect(sel.value)}else{$('#deviceHealth').textContent='NO PAIRED DEVICE'}sel.onchange=()=>{$('#name').textContent=sel.options[sel.selectedIndex]?.text||'Device';connect(sel.value)}}load();$('#pairBtn').onclick=async()=>{const r=await fetch('/parent/api/pair/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('#pairName').value})});const j=await r.json();$('#pairOut').textContent=j.token?('Pairing token (expires in 10 min):\\n'+j.token):JSON.stringify(j,null,2);setTimeout(load,2500)};</script></body></html>`;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/") return Response.redirect(new URL("/parent", url), 302);
    if (url.pathname === "/healthz") return json({ ok: true, env: env.APP_ENV });
    if (req.method === "POST" && url.pathname === "/api/pair/complete") return completePairing(req, env);

    const locationMatch = url.pathname.match(/^\/api\/device\/([^/]+)\/location$/);
    if (req.method === "POST" && locationMatch) return ingest(req, env, decodeURIComponent(locationMatch[1]));
    const healthMatch = url.pathname.match(/^\/api\/device\/([^/]+)\/health$/);
    if (req.method === "POST" && healthMatch) return ingestHealth(req, env, decodeURIComponent(healthMatch[1]));

    if (url.pathname === "/parent" || url.pathname === "/parent/") {
      const denied = await parentOnly(req); if (denied) return denied;
      return new Response(parentHtml(), { headers: { "content-type": "text/html; charset=utf-8", ...securityHeaders } });
    }
    if (req.method === "POST" && url.pathname === "/parent/api/pair/start") return createPairing(req, env);
    if (req.method === "GET" && url.pathname === "/parent/api/devices") return listDevices(req, env);
    const stateMatch = url.pathname.match(/^\/parent\/api\/device\/([^/]+)\/state$/);
    if (req.method === "GET" && stateMatch) return parentDeviceProxy(req, env, decodeURIComponent(stateMatch[1]), "state");
    const wsMatch = url.pathname.match(/^\/parent\/api\/device\/([^/]+)\/ws$/);
    if (wsMatch) return parentDeviceProxy(req, env, decodeURIComponent(wsMatch[1]), "ws");
    return new Response("Not found", { status: 404, headers: securityHeaders });
  },
  async queue(batch: MessageBatch<unknown>) {
    for (const message of batch.messages) message.ack();
  }
} satisfies ExportedHandler<Env>;
