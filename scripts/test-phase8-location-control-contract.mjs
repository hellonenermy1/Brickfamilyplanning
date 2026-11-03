import fs from 'node:fs';

const control = fs.readFileSync('src/phase6-location-control.ts', 'utf8');
const worker = fs.readFileSync('src/worker-v6.ts', 'utf8');

function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}
function forbidText(source, text, message) {
  if (source.includes(text)) throw new Error(message);
}

// Parent mutation path remains authenticated, lifecycle checked, revocation blocked and same-origin.
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

// Every parent tap creates one fresh, device-bound logical command. The stored target is command
// history, not a forever-desired state. Commands start pending and have a finite lifetime.
for (const [text, message] of [
  ['if (!DEVICE_ID_RE.test(deviceId))', 'device id format must be validated'],
  ['SELECT revoked_at FROM devices WHERE id=?1 LIMIT 1', 'command target must resolve to a registered device'],
  ['if (device.revoked_at !== null)', 'revoked command targets must fail closed'],
  ['const commandId = crypto.randomUUID();', 'each parent command must have a new logical id'],
  ["command_status)\n     VALUES(?1,?2,?3,?4,?4,'pending')", 'new command must enter pending state'],
  ['const LOGICAL_COMMAND_TTL_MS = 10 * 60_000;', 'logical command must have a bounded lifetime'],
  ['WHEN excluded.issued_at <= device_location_control.issued_at THEN device_location_control.issued_at + 1', 'command issue time must remain monotonic'],
]) requireText(control, text, message);

// Parent reads current actual truth separately from historical last-command truth. Do not reintroduce
// the superseded persistent desired/matchesDesired portal model.
for (const [text, message] of [
  ['actualEnabled: row.last_actual_enabled === null ? null : row.last_actual_enabled === 1', 'parent response must expose actual current Location truth'],
  ['lastCommand: {', 'parent response must expose the latest command as history/state'],
  ['targetEnabled: row.desired_enabled === 1', 'historical command target must remain inspectable'],
  ['status,', 'historical command lifecycle status must be inspectable'],
]) requireText(control, text, message);
forbidText(control, 'matchesDesired', 'one-shot control must not expose persistent desired-vs-actual matching semantics');

// Only an uncompleted pending command may be delivered. Completed/failed/expired commands become
// history and cannot be wrapped in a fresh nonce or delivered again.
for (const [text, message] of [
  ['row.command_status !== "pending"', 'delivery must be restricted to pending commands'],
  ['row.last_acked_command_id === row.command_id', 'already acknowledged command must be suppressed'],
  ['commandId: row.command_id', 'delivery envelope must identify logical command'],
  ['nonce: crypto.randomUUID()', 'each delivery attempt must carry a fresh nonce'],
  ['const DELIVERY_TTL_MS = 5 * 60_000;', 'individual delivery TTL must be bounded'],
  ['expiresAtMs: Math.min(row.issued_at + LOGICAL_COMMAND_TTL_MS, now + DELIVERY_TTL_MS)', 'delivery must never outlive logical command TTL'],
  ['headers.set("Cache-Control", "no-store")', 'command-bearing response must be uncacheable'],
]) requireText(control, text, message);

const pendingGuardAt = control.indexOf('row.command_status !== "pending"');
const nonceAt = control.indexOf('nonce: crypto.randomUUID()', pendingGuardAt);
if (!(pendingGuardAt >= 0 && nonceAt > pendingGuardAt)) throw new Error('pending/replay guard must execute before delivery nonce generation');

// Expiry must convert a still-pending command into terminal history rather than leaving a permanent
// target that future child/user toggles are judged against.
for (const [text, message] of [
  ["command_status='expired'", 'stale pending command must transition to expired'],
  ["result_reason='expired_before_delivery'", 'delivery expiry must be recorded truthfully'],
]) requireText(control, text, message);

// A signed health report always refreshes current actual state independently. It completes a command
// only when it carries that command ID with an explicit terminal result. The SQL WHERE clause binds
// both device and command, so a delayed old completion cannot complete a newer command.
for (const [text, message] of [
  ['UPDATE device_location_control SET last_actual_enabled=?1,last_actual_at=?2 WHERE device_id=?3', 'actual current state must update independently of command completion'],
  ['if (!commandId || (commandStatus !== "completed" && commandStatus !== "failed")) return;', 'only explicit terminal command results may complete history'],
  ['last_acked_command_id=?1,command_status=?2', 'terminal result must store command acknowledgement/status'],
  ['WHERE device_id=?8 AND command_id=?1', 'completion must be bound to both device and exact command id'],
]) requireText(control, text, message);

// Worker ordering: the copy of the child health body is used only after the signed base handler has
// accepted the request. Unauthenticated JSON cannot mutate current-state or command history.
const healthFn = worker.indexOf('async function healthWithConfiguration');
const baseHealthAt = worker.indexOf('const response = await base.fetch!(req, env, ctx);', healthFn);
const okAt = worker.indexOf('if (!response.ok) return response;', baseHealthAt);
const noteAt = worker.indexOf('noteLocationControlHealth(healthCopy, env, deviceId)', okAt);
const augmentAt = worker.indexOf('augmentHealthWithLocationControl(withAnchors, env, deviceId)', noteAt);
if (!(healthFn >= 0 && baseHealthAt > healthFn && okAt > baseHealthAt && noteAt > okAt && augmentAt > noteAt)) {
  throw new Error('signed health acceptance must precede Location actual-state/command-history mutation and command delivery');
}

console.log('Phase 8B one-shot Location control auth, lifecycle, bounded TTL, actual truth, terminal history and stale-ACK isolation contract OK');
