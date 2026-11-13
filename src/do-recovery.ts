import { canonicalDevicePublicKey } from "./crypto";

export type RecoveryEnv = {
  DB?: D1Database;
  BRICK_DEVICE?: DurableObjectNamespace;
  BRICK_RECOVERY_MODE?: string;
};
export const RECOVERY_KEYS = ["latest", "health", "networkEvidence", "lastSafetyEvent", "sequenceHighWater", "safetyEvaluationHighWater", "safetyHighWater", "wsRevoked"] as const;
const LIMIT = 64 * 1024;
const encoder = new TextEncoder();
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export async function recoveryDigest(text: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)))].map(x => x.toString(16).padStart(2, "0")).join("");
}
function jsonSafe(value: unknown, depth = 0): void {
  if (depth > 32) throw new Error("recovery state nesting limit");
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) { for (const item of value) jsonSafe(item, depth + 1); return; }
  if (record(value) && Object.getPrototypeOf(value) === Object.prototype) {
    for (const item of Object.values(value)) jsonSafe(item, depth + 1);
    return;
  }
  throw new Error("recovery state is not lossless JSON");
}
function checkState(state: unknown): asserts state is Record<string, unknown> {
  if (!record(state)) throw new Error("invalid recovery state");
  for (const [key, value] of Object.entries(state)) {
    if (!(RECOVERY_KEYS as readonly string[]).includes(key)) throw new Error("unknown recovery state key");
    if (key === "wsRevoked") { if (typeof value !== "boolean") throw new Error("invalid revocation fence"); }
    else if (key === "safetyHighWater") { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error("invalid safety marker"); }
    else if (key === "sequenceHighWater" || key === "safetyEvaluationHighWater") {
      if (!record(value) || !Number.isSafeInteger(value.epoch) || !Number.isSafeInteger(value.sequence) || (value.epoch as number) < 0 || (value.sequence as number) < 0) throw new Error("invalid sequence marker");
    } else if (!record(value)) throw new Error("invalid stored telemetry");
    jsonSafe(value);
  }
}
async function identity(ctx: DurableObjectState, env: RecoveryEnv, deviceId: string) {
  if (!env.DB || !env.BRICK_DEVICE || typeof deviceId !== "string" || !deviceId || deviceId.length > 128 || ctx.id.toString() !== env.BRICK_DEVICE.idFromName(deviceId).toString()) throw new Error("recovery namespace/device mismatch");
  const row = await env.DB.prepare("SELECT public_key_spki_b64, revoked_at FROM devices WHERE id=?1").bind(deviceId).first<{ public_key_spki_b64: string; revoked_at: number | null }>();
  const key = row && await canonicalDevicePublicKey(row.public_key_spki_b64);
  if (!key) throw new Error("recovery device identity absent or invalid");
  return { keySha256: await recoveryDigest(key), revoked: row!.revoked_at !== null };
}

// Internal RPC only. The caller must quiesce all stores: this transaction is DO-local,
// not a distributed D1/R2/DO snapshot or a replacement for the cloud recovery drill.
export async function exportDeviceRecovery(ctx: DurableObjectState, env: RecoveryEnv, deviceId: string, betaDiagnostic = false) {
  const device = await identity(ctx, env, deviceId);
  const state = await ctx.storage.transaction(async txn => Object.fromEntries(await txn.list({ limit: RECOVERY_KEYS.length + (betaDiagnostic ? 2 : 1) })));
  // Refuse a stale identity/revocation observation; do not rewrite source state
  // or label this two-read check a distributed snapshot/quiescence guarantee.
  const current = await identity(ctx, env, deviceId);
  if (current.keySha256 !== device.keySha256 || current.revoked !== device.revoked)
    throw new Error("DO recovery identity changed during export");
  if (betaDiagnostic && 'betaDiagnostic' in state) {
    const probe = state.betaDiagnostic;
    if (!record(probe) || Object.keys(probe).sort().join(',') !== 'expiresAt,token' || typeof probe.token !== 'string' || !/^[0-9a-f-]{36}$/.test(probe.token) || !Number.isSafeInteger(probe.expiresAt) || (probe.expiresAt as number) <= 0) throw new Error('invalid beta diagnostic recovery state');
    // Disposable challenge, never recovery state or authority. Filter the captured
    // copy only; do not mutate a still-active readiness probe while exporting.
    delete state.betaDiagnostic;
  }
  checkState(state);
  // Preserve a D1 revocation even if a previously interrupted revoke missed this DO.
  if (device.revoked) state.wsRevoked = true;
  const serialized = JSON.stringify({ format: "brick-do-snapshot-v1", deviceId, keySha256: device.keySha256, capturedAt: Date.now(), state });
  if (encoder.encode(serialized).byteLength > LIMIT) throw new Error("DO recovery snapshot too large");
  return serialized;
}

export async function restoreDeviceRecovery(ctx: DurableObjectState, env: RecoveryEnv, deviceId: string, serialized: string, sha256: string, setRevoked: (value: boolean) => void) {
  if (env.BRICK_RECOVERY_MODE !== "isolated-restore") throw new Error("DO restore disabled");
  if (typeof serialized !== "string" || serialized.length > LIMIT || encoder.encode(serialized).byteLength > LIMIT || !/^[a-f0-9]{64}$/.test(sha256) || await recoveryDigest(serialized) !== sha256) throw new Error("DO recovery integrity mismatch");
  const snapshot: unknown = JSON.parse(serialized);
  if (!record(snapshot) || Object.keys(snapshot).sort().join(",") !== "capturedAt,deviceId,format,keySha256,state" || snapshot.format !== "brick-do-snapshot-v1" || snapshot.deviceId !== deviceId || !Number.isSafeInteger(snapshot.capturedAt) || (snapshot.capturedAt as number) <= 0) throw new Error("invalid DO recovery envelope");
  checkState(snapshot.state);
  const state = snapshot.state;
  // Compare lossless JSON state, including nested values, without making object
  // insertion order an integrity boundary. Array order remains significant.
  const canonical = (value: unknown) => JSON.stringify(value, (_key, item) =>
    record(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
  // Catch expected refusals inside the concurrency block to avoid resetting the DO.
  let writeAttempted = false;
  const error = await ctx.blockConcurrencyWhile(async () => {
    try {
      const device = await identity(ctx, env, deviceId);
      if (device.keySha256 !== snapshot.keySha256) throw new Error("DO recovery device key mismatch");
      if (ctx.getWebSockets().length || await ctx.storage.getAlarm() !== null) throw new Error("DO restore target has sockets/alarm");
      const revoked = device.revoked || state.wsRevoked === true;
      if (revoked) state.wsRevoked = true;
      await ctx.storage.transaction(async txn => {
        if ((await txn.list({ limit: 1 })).size) throw new Error("DO restore target is not empty");
        // A rejected transaction receipt may still conceal a committed write.
        writeAttempted = true;
        if (Object.keys(state).length) await txn.put(state);
      });
      const current = await identity(ctx, env, deviceId);
      if (current.keySha256 !== device.keySha256 || current.revoked !== device.revoked)
        throw new Error("DO recovery identity changed during restore");
      const restored = Object.fromEntries(await ctx.storage.list({ limit: RECOVERY_KEYS.length + 1 }));
      checkState(restored);
      if (canonical(restored) !== canonical(state)) throw new Error("DO recovery state reconciliation failed");
      if (ctx.getWebSockets().length || await ctx.storage.getAlarm() !== null)
        throw new Error("DO restore target changed sockets/alarm");
      setRevoked(revoked);
      return null;
    } catch (e) {
      if (writeAttempted) {
        // Never promote or retry a partially written or unknown-outcome target.
        // Persistent fencing is best effort if storage itself is unavailable;
        // the failed receipt still requires isolation/manual reconciliation.
        try { setRevoked(true); } catch {}
        try { await ctx.storage.put("wsRevoked", true); } catch {}
        try { for (const ws of ctx.getWebSockets()) ws.close(4003, "Recovery unverified"); } catch {}
        return "DO recovery postflight uncertain; keep target isolated";
      }
      return e instanceof Error ? e.message : "DO restore failed";
    }
  });
  if (error) throw new Error(error);
  return true;
}
