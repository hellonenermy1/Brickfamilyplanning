import { readBoundedBody } from "./bounded-body";
import { verifyDeviceSignature } from "./crypto";

export type ScreenTimeEnv = { DB: D1Database };
type Device = { public_key_spki_b64: string; revoked_at: number | null };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function ingestScreenTime(req: Request, env: ScreenTimeEnv, deviceId: string) {
  const d = await env.DB.prepare("SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=?1").bind(deviceId).first<Device>();
  if (!d || d.revoked_at !== null) return json({ error: "device unauthorized" }, 401);
  const sig = req.headers.get("X-Brick-Signature");
  if (!sig || sig.length > 512) return json({ error: "missing signature" }, 401);
  const bounded = await readBoundedBody(req, 4096);
  if (!bounded.ok || !bounded.body.byteLength) return json({ error: "invalid payload" }, 400);
  if (!(await verifyDeviceSignature(d.public_key_spki_b64, bounded.body, sig))) return json({ error: "bad signature" }, 401);
  let b: Record<string, unknown>;
  try { b = JSON.parse(new TextDecoder().decode(bounded.body)) as Record<string, unknown>; } catch { return json({ error: "invalid JSON" }, 400); }
  const day = b.localDay, total = b.totalForegroundMs, sessions = b.sessionCount, captured = b.capturedAtMs;
  if (b.protocol !== 1 || typeof day !== "string" || !DAY_RE.test(day) || typeof total !== "number" || !Number.isSafeInteger(total) || total < 0 || total > 24 * 60 * 60_000 ||
      typeof sessions !== "number" || !Number.isSafeInteger(sessions) || sessions < 0 || sessions > 100_000 ||
      typeof captured !== "number" || !Number.isSafeInteger(captured) || Math.abs(Date.now() - captured) > 3 * 86_400_000 ||
      b.privacy !== "aggregate_only_no_package_names") return json({ error: "invalid screen-time summary" }, 400);
  const summary = JSON.stringify({ privacy: b.privacy, capturedAtMs: captured });
  await env.DB.prepare(`INSERT INTO screen_time_daily(device_id,local_day,total_foreground_ms,session_count,summary_json,received_at)
    VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(device_id,local_day) DO UPDATE SET
    total_foreground_ms=excluded.total_foreground_ms,session_count=excluded.session_count,summary_json=excluded.summary_json,received_at=excluded.received_at`)
    .bind(deviceId, day, total, sessions, summary, Date.now()).run();
  return json({ ok: true, localDay: day });
}

export async function parentScreenTime(env: ScreenTimeEnv, deviceId: string, days = 14) {
  const limit = Math.max(1, Math.min(90, Math.trunc(days)));
  const r = await env.DB.prepare("SELECT local_day,total_foreground_ms,session_count,summary_json,received_at FROM screen_time_daily WHERE device_id=?1 ORDER BY local_day DESC LIMIT ?2")
    .bind(deviceId, limit).all();
  return json({ days: r.results });
}
