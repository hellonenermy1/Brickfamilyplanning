import { BrickDevice, type DeviceHealth } from "./device-do";
import { decodeLivePacket, V1_BYTES, V2_BYTES } from "./protocol";
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
type SafetyEvent = {
  protocol: 1;
  eventId: string;
  kind: "safe_checkin" | "sos_started" | "sos_cancelled" | "geofence_enter" | "geofence_exit" | "trip_started" | "trip_ended" | "trip_alert";
  createdAtMs: number;
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  detail?: Record<string, unknown>;
};
type QueueLocation = { type: "location"; deviceId: string; packet: Record<string, unknown> };

const EVENT_KINDS = new Set<SafetyEvent["kind"]>([
  "safe_checkin", "sos_started", "sos_cancelled", "geofence_enter", "geofence_exit", "trip_started", "trip_ended", "trip_alert"
]);

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
  const verified = await verifySignedPayload(req, device, V2_BYTES);
  if (verified instanceof Response) return verified;
  if (verified.byteLength !== V1_BYTES && verified.byteLength !== V2_BYTES) return json({ error: "bad packet length" }, 400);

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
  if (!(h.protocol === 1 &&
    typeof h.elapsedRealtimeMs === "number" && h.elapsedRealtimeMs >= 0 &&
    typeof h.serviceUptimeMs === "number" && h.serviceUptimeMs >= 0 &&
    (h.locationAgeMs === null || (typeof h.locationAgeMs === "number" && h.locationAgeMs >= 0)) &&
    (h.ackAgeMs === null || (typeof h.ackAgeMs === "number" && h.ackAgeMs >= 0)) &&
    typeof h.pendingRecords === "number" && Number.isInteger(h.pendingRecords) && h.pendingRecords >= 0 && h.pendingRecords <= 10_000_000 &&
    (h.oldestPendingAgeMs === null || (typeof h.oldestPendingAgeMs === "number" && h.oldestPendingAgeMs >= 0)) &&
    (network === "wifi" || network === "mobile" || network === "other" || network === "offline") &&
    typeof h.locationEnabled === "boolean" && typeof h.locationSubscribed === "boolean" &&
    typeof h.managed === "boolean" && typeof h.recoveryCount === "number" && Number.isInteger(h.recoveryCount) && h.recoveryCount >= 0 &&
    typeof h.appVersion === "string" && h.appVersion.length <= 64)) return false;

  if (h.activityMode !== undefined && typeof h.activityMode !== "string") return false;
  if (h.activityConfidence !== undefined && (typeof h.activityConfidence !== "number" || h.activityConfidence < 0 || h.activityConfidence > 100)) return false;
  if (h.trackingIntervalMs !== undefined && (typeof h.trackingIntervalMs !== "number" || h.trackingIntervalMs < 1000 || h.trackingIntervalMs > 300000)) return false;
  if (h.gnssUsedInFix !== undefined && (typeof h.gnssUsedInFix !== "number" || h.gnssUsedInFix < 0 || h.gnssUsedInFix > 255)) return false;
  if (h.gnssTotal !== undefined && (typeof h.gnssTotal !== "number" || h.gnssTotal < 0 || h.gnssTotal > 255)) return false;
  return true;
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

function validSafetyEvent(x: unknown): x is SafetyEvent {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  if (e.protocol !== 1 || typeof e.eventId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(e.eventId)) return false;
  if (typeof e.kind !== "string" || !EVENT_KINDS.has(e.kind as SafetyEvent["kind"])) return false;
  if (typeof e.createdAtMs !== "number" || !Number.isFinite(e.createdAtMs)) return false;
  if (e.latitude !== undefined && e.latitude !== null && (typeof e.latitude !== "number" || e.latitude < -90 || e.latitude > 90)) return false;
  if (e.longitude !== undefined && e.longitude !== null && (typeof e.longitude !== "number" || e.longitude < -180 || e.longitude > 180)) return false;
  if (e.accuracyM !== undefined && e.accuracyM !== null && (typeof e.accuracyM !== "number" || e.accuracyM < 0 || e.accuracyM > 100000)) return false;
  if (e.detail !== undefined && (!e.detail || typeof e.detail !== "object" || Array.isArray(e.detail))) return false;
  return true;
}

async function ingestSafetyEvent(req: Request, env: Env, deviceId: string) {
  const rl = await env.DEVICE_RATE.limit({ key: `${deviceId}:event` });
  if (!rl.success) return json({ error: "rate limited" }, 429);
  const device = await getAuthorizedDevice(env, deviceId);
  if (!device) return json({ error: "device unauthorized" }, 401);
  const verified = await verifySignedPayload(req, device, 8192);
  if (verified instanceof Response) return verified;

  let event: unknown;
  try { event = JSON.parse(new TextDecoder().decode(verified)); } catch { return json({ error: "invalid event JSON" }, 400); }
  if (!validSafetyEvent(event)) return json({ error: "invalid event schema" }, 400);
  const now = Date.now();
  if (event.createdAtMs > now + 10 * 60_000 || event.createdAtMs < now - 30 * 24 * 60 * 60_000) {
    return json({ error: "event timestamp outside allowed window" }, 400);
  }
  const detailJson = JSON.stringify(event.detail ?? {});
  if (detailJson.length > 4096) return json({ error: "event detail too large" }, 400);

  const inserted = await env.DB.prepare(
    "INSERT OR IGNORE INTO safety_events(id,device_id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)"
  ).bind(
    event.eventId, deviceId, event.kind, event.createdAtMs, now,
    event.latitude ?? null, event.longitude ?? null, event.accuracyM ?? null, detailJson
  ).run();
  const duplicate = (inserted.meta.changes ?? 0) === 0;
  if (!duplicate) await env.EVENTS.send({ type: "safety_event", deviceId, event });
  return json({ ok: true, eventId: event.eventId, duplicate, receivedAt: now });
}

async function listDevices(req: Request, env: Env) {
  const denied = await parentOnly(req); if (denied) return denied;
  const result = await env.DB.prepare(
    "SELECT id,name,created_at,last_seen_at,last_health_at,health_status,recovery_count,pending_records,app_version,revoked_at FROM devices ORDER BY created_at DESC"
  ).all();
  return json({ devices: result.results });
}

async function listSafetyEvents(req: Request, env: Env, deviceId: string) {
  const denied = await parentOnly(req); if (denied) return denied;
  const exists = await env.DB.prepare("SELECT id FROM devices WHERE id=?1 AND revoked_at IS NULL").bind(deviceId).first();
  if (!exists) return json({ error: "device not found" }, 404);
  const url = new URL(req.url);
  const requested = Number(url.searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(500, Math.trunc(requested))) : 100;
  const result = await env.DB.prepare(
    "SELECT id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json FROM safety_events WHERE device_id=?1 ORDER BY server_created_at DESC LIMIT ?2"
  ).bind(deviceId, limit).all();
  return json({ events: result.results });
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
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Brick Parent</title><link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.css"><style>html,body{margin:0;font-family:system-ui;background:#f4f6f8;color:#121417}header{height:56px;padding:0 20px;background:#fff;border-bottom:1px solid #e4e7eb;display:flex;align-items:center;justify-content:space-between}.wrap{display:grid;grid-template-columns:minmax(0,1fr) 360px;min-height:calc(100vh - 57px)}#map{min-height:540px}.panel{background:#fff;padding:20px;border-left:1px solid #e4e7eb}.row{display:flex;justify-content:space-between;gap:20px;padding:9px 0;border-bottom:1px solid #eef0f2}.muted{color:#69727d}.good{color:#177245}.warn{color:#a15c00}.bad{color:#b42318}.tag{text-transform:uppercase;letter-spacing:.04em;font-size:12px}button,input,select{font:inherit}button{cursor:pointer}input,select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cfd5dc;border-radius:8px}.primary{margin-top:8px;width:100%;padding:11px;border:0;border-radius:8px;background:#121417;color:white}pre{white-space:pre-wrap;word-break:break-all;background:#f5f6f7;padding:10px;border-radius:8px}@media(max-width:760px){.wrap{grid-template-columns:1fr}.panel{border-left:0;border-top:1px solid #ddd}#map{min-height:55vh}}</style></head><body><header><strong>BRICK</strong><span><b id="deviceHealth">DEVICE —</b> · <b id="positionHealth">POSITION —</b></span></header><div class="wrap"><div id="map"></div><aside class="panel"><label>Device</label><select id="devices"></select><h2 id="name">No device</h2><div class="row"><span>Position quality</span><b id="quality" class="tag">—</b></div><div class="row"><span>Uncertainty</span><b id="accuracy">—</b></div><div class="row"><span>Speed</span><b id="speed">—</b></div><div class="row"><span>Movement</span><b id="activity">—</b></div><div class="row"><span>Source</span><b id="source">—</b></div><div class="row"><span>GNSS</span><b id="gnss">—</b></div><div class="row"><span>Battery</span><b id="battery">—</b></div><div class="row"><span>Network</span><b id="network">—</b></div><div class="row"><span>Pending</span><b id="pending">—</b></div><div class="row"><span>Updated</span><b id="updated">—</b></div><hr><h3>Pair device</h3><input id="pairName" value="Child phone" maxlength="64"><button id="pairBtn" class="primary">Create 10-minute pairing code</button><pre id="pairOut">—</pre></aside></div><script type="module">import maplibregl from 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs';const map=new maplibregl.Map({container:'map',style:'https://demotiles.maplibre.org/style.json',center:[103.8198,1.3521],zoom:11});let marker,ws,timer,current,last;const $=s=>document.querySelector(s);function statusEl(el,text,state){el.textContent=text;el.className=state==='healthy'||state==='fresh'?'good':state==='degraded'||state==='stale'?'warn':state==='unknown'?'muted':'bad'}function renderSnapshot(s){if(!s)return;last=s;const l=s.latest,h=s.health,d=s.derived||{};statusEl($('#deviceHealth'),'DEVICE '+String(d.deviceStatus||'unknown').toUpperCase(),d.deviceStatus);statusEl($('#positionHealth'),'POSITION '+String(d.positionStatus||'unknown').toUpperCase(),d.positionStatus);if(l){$('#quality').textContent=String(l.quality||'unknown').replace('_',' ');$('#accuracy').textContent=l.uncertaintyM==null?'—':'±'+Math.round(l.uncertaintyM)+' m';$('#speed').textContent=l.speedKph==null?'—':l.speedKph.toFixed(l.speedKph<10?1:0)+' km/h'+(l.speedAccuracyKph==null?'':' ±'+l.speedAccuracyKph.toFixed(1));$('#activity').textContent=String(l.activity||'unknown')+(l.activityConfidence>0?' · '+l.activityConfidence+'%':'');$('#source').textContent=String(l.source||'unknown')+(l.fallback?' (fallback)':'');$('#gnss').textContent=l.gnss&&l.gnss.total?l.gnss.usedInFix+'/'+l.gnss.total+(l.gnss.averageCn0DbHz?' · '+l.gnss.averageCn0DbHz.toFixed(1)+' dB-Hz':''):'—';$('#battery').textContent=l.batteryPct+'%'+(l.charging?' · charging':'');$('#updated').textContent=Math.max(0,Math.round((Date.now()-l.receivedAt)/1000))+' sec ago';if(l.lat!=null&&l.lon!=null){const ll=[l.lon,l.lat];if(!marker){marker=new maplibregl.Marker().setLngLat(ll).addTo(map);map.flyTo({center:ll,zoom:16})}else marker.setLngLat(ll)}}if(h){$('#network').textContent=h.network;$('#pending').textContent=h.pendingRecords}}function mergeMessage(m){if(m.type==='snapshot'){renderSnapshot(m);return}const n=structuredClone(last||{latest:null,health:null,derived:{}});if(m.type==='location')n.latest=m.state;if(m.type==='health')n.health=m.health;if(m.derived)n.derived=m.derived;renderSnapshot(n)}async function connect(id){current=id;if(ws)ws.close();const proto=location.protocol==='https:'?'wss://':'ws://';ws=new WebSocket(proto+location.host+'/parent/api/device/'+encodeURIComponent(id)+'/ws');ws.onmessage=e=>mergeMessage(JSON.parse(e.data));ws.onclose=()=>{if(current===id)timer=setTimeout(()=>connect(id),1500)}}async function load(){const r=await fetch('/parent/api/devices');const j=await r.json();const sel=$('#devices');sel.innerHTML='';for(const d of j.devices||[]){const o=document.createElement('option');o.value=d.id;o.textContent=d.name;sel.appendChild(o)}if(sel.value){$('#name').textContent=sel.options[sel.selectedIndex].text;connect(sel.value)}else{$('#deviceHealth').textContent='NO PAIRED DEVICE'}sel.onchange=()=>{$('#name').textContent=sel.options[sel.selectedIndex]?.text||'Device';connect(sel.value)}}load();$('#pairBtn').onclick=async()=>{const r=await fetch('/parent/api/pair/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('#pairName').value})});const j=await r.json();$('#pairOut').textContent=j.token?('Pairing token (expires in 10 min):\\n'+j.token):JSON.stringify(j,null,2);setTimeout(load,2500)};</script></body></html>`;
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
    const eventMatch = url.pathname.match(/^\/api\/device\/([^/]+)\/event$/);
    if (req.method === "POST" && eventMatch) return ingestSafetyEvent(req, env, decodeURIComponent(eventMatch[1]));

    if (url.pathname === "/parent" || url.pathname === "/parent/") {
      const denied = await parentOnly(req); if (denied) return denied;
      return new Response(parentHtml(), { headers: { "content-type": "text/html; charset=utf-8", ...securityHeaders } });
    }
    if (req.method === "POST" && url.pathname === "/parent/api/pair/start") return createPairing(req, env);
    if (req.method === "GET" && url.pathname === "/parent/api/devices") return listDevices(req, env);
    const stateMatch = url.pathname.match(/^\/parent\/api\/device\/([^/]+)\/state$/);
    if (req.method === "GET" && stateMatch) return parentDeviceProxy(req, env, decodeURIComponent(stateMatch[1]), "state");
    const eventsMatch = url.pathname.match(/^\/parent\/api\/device\/([^/]+)\/events$/);
    if (req.method === "GET" && eventsMatch) return listSafetyEvents(req, env, decodeURIComponent(eventsMatch[1]));
    const wsMatch = url.pathname.match(/^\/parent\/api\/device\/([^/]+)\/ws$/);
    if (wsMatch) return parentDeviceProxy(req, env, decodeURIComponent(wsMatch[1]), "ws");
    return new Response("Not found", { status: 404, headers: securityHeaders });
  },
  async queue(batch: MessageBatch<unknown>, env: Env) {
    for (const message of batch.messages) {
      try {
        const body = message.body as Partial<QueueLocation> & { type?: string };
        if (body.type === "location" && typeof body.deviceId === "string" && body.packet && typeof body.packet === "object") {
          const packet = body.packet as Record<string, unknown>;
          const epoch = typeof packet.epoch === "number" ? packet.epoch : 0;
          const sequence = typeof packet.sequence === "number" ? packet.sequence : 0;
          const wall = typeof packet.wallTimeMs === "number" && Number.isFinite(packet.wallTimeMs) ? packet.wallTimeMs : Date.now();
          const day = new Date(wall).toISOString().slice(0, 10);
          const safeDevice = body.deviceId.replace(/[^a-zA-Z0-9_-]/g, "_");
          const key = `history/${safeDevice}/${day}/${epoch}-${sequence}.json`;
          await env.HISTORY.put(key, JSON.stringify({ deviceId: body.deviceId, storedAt: Date.now(), packet }), {
            httpMetadata: { contentType: "application/json" },
            customMetadata: { deviceId: body.deviceId, day }
          });
        }
        message.ack();
      } catch {
        message.retry();
      }
    }
  }
} satisfies ExportedHandler<Env>;
