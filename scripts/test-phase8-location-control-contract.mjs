import fs from 'node:fs';

const control = fs.readFileSync('src/phase6-location-control.ts', 'utf8');
const worker = fs.readFileSync('src/worker-v6.ts', 'utf8');

function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

// Parent mutation path: authenticate first, resolve the device lifecycle, then refuse all
// non-revocation mutations once the identity has been revoked.
const parentBlock = worker.indexOf('const match = u.pathname.match(/^\\/parent\\/api\\/device\\/([^/]+)(\\/.*)$/);');
const requireParentAt = worker.indexOf('const denied = await requireParent(req, env); if (denied) return denied;', parentBlock);
const lifecycleAt = worker.indexOf('const life = await lifecycle(env, deviceId);', requireParentAt);
const revokedAt = worker.indexOf('if (life.revoked_at !== null) return archivedRead(req, env, deviceId, suffix);', lifecycleAt);
const locationPostAt = worker.indexOf('if (suffix === "/location-control" && req.method === "POST")', revokedAt);
const sameOriginAt = worker.indexOf('if (!sameOriginMutation(req)) return json({ error: "same-origin request required" }, 403);', locationPostAt);
const setAt = worker.indexOf('parentSetLocationControl(req, env, deviceId)', sameOriginAt);
if (!(parentBlock >= 0 && requireParentAt > parentBlock && lifecycleAt > requireParentAt && revokedAt > lifecycleAt &&
      locationPostAt > revokedAt && sameOriginAt > locationPostAt && setAt > sameOriginAt)) {
  throw new Error('location-control mutation must be parent-authenticated, lifecycle-checked, revocation-blocked and same-origin before mutation');
}

// The command belongs to exactly one registered, non-revoked device. Every parent tap gets a fresh
// logical ID, and DB time remains strictly monotonic even when two commands happen in one ms.
for (const [text, message] of [
  ['if (!DEVICE_ID_RE.test(deviceId))', 'device id format must be validated'],
  ['SELECT revoked_at FROM devices WHERE id=?1 LIMIT 1', 'command target must resolve to a registered device'],
  ['if (device.revoked_at !== null)', 'revoked command targets must fail closed'],
  ['const commandId = crypto.randomUUID();', 'each parent command must have a new logical id'],
  ['WHEN excluded.issued_at <= device_location_control.issued_at THEN device_location_control.issued_at + 1', 'command issue time must be monotonic'],
]) requireText(control, text, message);

// Delivery is piggybacked only onto a successful, authenticated child health response and is short
// lived, device-bound, nonce-bearing and uncacheable.
for (const [text, message] of [
  ['if (!response.ok || !DEVICE_ID_RE.test(deviceId)) return response;', 'failed/invalid health response must not carry commands'],
  ['deviceId,', 'delivery envelope must identify its target device'],
  ['commandId: row.command_id', 'delivery envelope must identify the logical command'],
  ['nonce: crypto.randomUUID()', 'each delivery must carry a fresh nonce'],
  ['expiresAtMs: now + DELIVERY_TTL_MS', 'delivery must expire'],
  ['const DELIVERY_TTL_MS = 5 * 60_000;', 'delivery TTL must remain tightly bounded'],
  ['headers.set("Cache-Control", "no-store")', 'command-bearing responses must not be cached'],
]) requireText(control, text, message);

// A signed health request may report actual state, but it can acknowledge only the command that is
// still current for that exact device. A delayed ACK for an old command cannot mark a newer one done.
requireText(control,
  'last_acked_command_id=CASE WHEN command_id=?3 THEN ?3 ELSE last_acked_command_id END',
  'ACK must be conditional on the currently issued command id');
requireText(control, 'WHERE device_id=?4', 'actual-state/ACK update must remain device-bound');

// Worker ordering matters: the copy is used only after the base device handler accepted the signed
// health request. Unauthenticated JSON cannot mutate command ACK/actual state.
const healthFn = worker.indexOf('async function healthWithConfiguration');
const baseHealthAt = worker.indexOf('const response = await base.fetch!(req, env, ctx);', healthFn);
const okAt = worker.indexOf('if (!response.ok) return response;', baseHealthAt);
const noteAt = worker.indexOf('noteLocationControlHealth(healthCopy, env, deviceId)', okAt);
const augmentAt = worker.indexOf('augmentHealthWithLocationControl(withAnchors, env, deviceId)', noteAt);
if (!(healthFn >= 0 && baseHealthAt > healthFn && okAt > baseHealthAt && noteAt > okAt && augmentAt > noteAt)) {
  throw new Error('signed health acceptance must precede command ACK/state mutation and command delivery');
}

console.log('Phase 8 location-control parent auth, revocation, device binding, TTL, monotonicity and ACK replay contract OK');
