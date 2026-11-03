import { readBoundedBody } from "./bounded-body";
import { verifyDeviceSignature } from "./crypto";
import { decodeEvidenceDevicePath } from "./evidence-route";
import { nearbyPrivateRouteGraph, ROUTE_GRAPH_MAX_SEGMENTS, ROUTE_GRAPH_RADIUS_M, type PrivateRouteGraphSegment } from "./route-graph-data";

const MAX_REQUEST_BYTES = 1_024;

type DeviceRecord = { public_key_spki_b64: string; revoked_at: number | null };
export type RouteGraphRateLimit = { limit(input: { key: string }): Promise<{ success: boolean }> };
export type RouteGraphEnv = {
  DB: D1Database;
  MAPS: R2Bucket;
  DEVICE_RATE: RouteGraphRateLimit;
};
export type RouteGraphLoader = (maps: R2Bucket, lon: number, lat: number) => Promise<PrivateRouteGraphSegment[]>;

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

function attemptKey(req: Request) {
  const ip = (req.headers.get("CF-Connecting-IP") ?? "").trim();
  return `route-graph-attempt:${ip && ip.length <= 64 ? ip : "unknown"}`;
}

async function device(env: RouteGraphEnv, id: string) {
  const row = await env.DB.prepare("SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=?1").bind(id).first<DeviceRecord>();
  return row && row.revoked_at === null ? row : null;
}

function strictRequest(body: ArrayBuffer): { lat: number; lon: number } {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid route graph JSON");
  const obj = value as Record<string, unknown>;
  if (obj.protocol !== 1 || typeof obj.lat !== "number" || typeof obj.lon !== "number") throw new Error("invalid route graph schema");
  if (!Number.isFinite(obj.lat) || !Number.isFinite(obj.lon) || obj.lat < -90 || obj.lat > 90 || obj.lon < -180 || obj.lon > 180) throw new Error("invalid route graph coordinate");
  const keys = Object.keys(obj);
  if (keys.some(key => !["protocol", "lat", "lon"].includes(key))) throw new Error("unexpected route graph field");
  return { lat: obj.lat, lon: obj.lon };
}

export async function handleRouteGraphRequest(
  req: Request,
  env: RouteGraphEnv,
  deviceId: string,
  loader: RouteGraphLoader = nearbyPrivateRouteGraph
): Promise<Response> {
  if (!decodeEvidenceDevicePath(deviceId)) return json({ error: "invalid device path" }, 400);

  const attempt = await env.DEVICE_RATE.limit({ key: attemptKey(req) });
  if (!attempt.success) return json({ error: "rate limited" }, 429);

  const paired = await device(env, deviceId);
  if (!paired) return json({ error: "device unauthorized" }, 401);

  const contentType = (req.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return json({ error: "unsupported route graph content type" }, 415);
  const signature = req.headers.get("X-Brick-Signature");
  if (!signature || signature.length > 512) return json({ error: "missing or invalid signature" }, 401);

  const bounded = await readBoundedBody(req, MAX_REQUEST_BYTES);
  if (!bounded.ok) return bounded.reason === "too_large" ? json({ error: "route graph request too large" }, 413) : json({ error: "could not read route graph request" }, 400);
  if (!bounded.body.byteLength) return json({ error: "empty route graph request" }, 400);
  if (!(await verifyDeviceSignature(paired.public_key_spki_b64, bounded.body, signature))) return json({ error: "bad signature" }, 401);

  const deviceRate = await env.DEVICE_RATE.limit({ key: `route-graph-device:${deviceId}` });
  if (!deviceRate.success) return json({ error: "rate limited" }, 429);

  let point: { lat: number; lon: number };
  try { point = strictRequest(bounded.body); }
  catch (error) { return json({ error: String(error) }, 400); }

  try {
    const segments = (await loader(env.MAPS, point.lon, point.lat)).slice(0, ROUTE_GRAPH_MAX_SEGMENTS);
    return json({
      protocol: 1,
      generatedAtMs: Date.now(),
      center: { lat: point.lat, lon: point.lon },
      radiusM: ROUTE_GRAPH_RADIUS_M,
      segments: segments.map(segment => ({
        id: segment.id.slice(0, 120),
        aLat: segment.a[1], aLon: segment.a[0],
        bLat: segment.b[1], bLon: segment.b[0],
        allowedModeMask: segment.allowedModeMask,
        kind: segment.kind,
        kindDetail: segment.kindDetail
      }))
    });
  } catch {
    // Missing/corrupt private map is an optional evidence-source failure. The phone keeps using
    // learned routes/odometry and the existing server corridor path; never invent geometry.
    return json({ error: "private route graph unavailable" }, 503);
  }
}
