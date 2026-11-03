import { readJsonObject } from "./history-codec";

type Env = { HISTORY: R2Bucket };
type ReceiptRow = [number, number];
type ReceiptObject = { receipts?: ReceiptRow[] };
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function safeDeviceId(id: string) { return id.replace(/[^a-zA-Z0-9_-]/g, "_"); }
function dayList(start: number, end: number) {
  const out: string[] = [];
  for (let t = new Date(start).setUTCHours(0, 0, 0, 0); t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
function validReceipt(value: unknown): value is ReceiptRow {
  return Array.isArray(value) && value.length === 2 && Number.isSafeInteger(value[0]) && value[0] > 0 &&
    Number.isSafeInteger(value[1]) && value[1] > 0;
}
function keyOf(point: JsonObject) {
  return Number.isSafeInteger(point.epoch) && Number.isSafeInteger(point.sequence)
    ? `${point.epoch}:${point.sequence}`
    : null;
}
function epochFromSegmentKey(key: string) {
  const match = key.match(/-e(\d+)\.json\.gz$/);
  if (!match) return null;
  const epoch = Number(match[1]);
  return Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : null;
}

async function collectReceipts(
  env: Env,
  deviceId: string,
  days: string[],
  needed: Set<string>,
  prefixKind: "trusted" | "raw"
) {
  const out = new Map<string, number>();
  const safe = safeDeviceId(deviceId);
  for (const day of days) {
    let cursor: string | undefined;
    do {
      const list = await env.HISTORY.list({ prefix: `history/${prefixKind}/${safe}/${day}/`, cursor, limit: 1000 });
      for (const item of list.objects) {
        const epoch = epochFromSegmentKey(item.key);
        if (epoch === null) continue;
        const body = await env.HISTORY.get(item.key);
        if (!body) continue;
        let parsed: ReceiptObject;
        try { parsed = await readJsonObject<ReceiptObject>(body); } catch { continue; }
        if (!Array.isArray(parsed.receipts)) continue;
        for (const row of parsed.receipts) {
          if (!validReceipt(row)) continue;
          const key = `${epoch}:${row[0]}`;
          if (!needed.has(key)) continue;
          const current = out.get(key);
          if (current === undefined || row[1] < current) out.set(key, row[1]);
        }
      }
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor && out.size < needed.size);
    if (out.size >= needed.size) break;
  }
  return out;
}

function applyReceipts(value: unknown, receipts: Map<string, number>) {
  if (!Array.isArray(value)) return value;
  return value.map(raw => {
    const point = object(raw);
    if (!point) return raw;
    const key = keyOf(point);
    const receivedAt = key ? receipts.get(key) : undefined;
    return receivedAt === undefined ? raw : { ...point, serverReceivedAtMs: receivedAt };
  });
}

/**
 * Enrich the parent history response with ingestion provenance without changing the canonical event
 * time (`wallTimeMs`) or any movement summary. Old v4 history objects simply have no receipts and
 * remain readable. New v5 objects expose `serverReceivedAtMs` per point so delayed offline uploads
 * are auditable instead of being confused with when movement actually occurred.
 */
export async function augmentPhase8HistoryProvenance(
  response: Response,
  env: Env,
  deviceId: string,
  fromMs: number,
  toMs: number
): Promise<Response> {
  if (!response.ok) return response;
  const type = (response.headers.get("Content-Type") ?? "").toLowerCase();
  if (!type.includes("application/json")) return response;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs || toMs - fromMs > 31 * 86_400_000) return response;

  let body: JsonObject;
  try { body = await response.json<JsonObject>(); } catch { return response; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;

  const needed = new Set<string>();
  for (const collection of [body.points, body.displayPoints]) {
    if (!Array.isArray(collection)) continue;
    for (const raw of collection) {
      const point = object(raw), key = point ? keyOf(point) : null;
      if (key) needed.add(key);
    }
  }
  if (!needed.size) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Brick-History-Provenance", "phase8-v1");
    return new Response(JSON.stringify({ ...body, historyProvenance: { eventTimeField: "wallTimeMs", serverReceiptField: "serverReceivedAtMs", receiptsAvailable: 0 } }), {
      status: response.status, statusText: response.statusText, headers
    });
  }

  const days = dayList(Math.max(0, fromMs), toMs);
  let receipts = new Map<string, number>();
  try {
    receipts = await collectReceipts(env, deviceId, days, needed, "trusted");
    if (receipts.size < needed.size) {
      const missing = new Set([...needed].filter(key => !receipts.has(key)));
      const raw = await collectReceipts(env, deviceId, days, missing, "raw");
      for (const [key, value] of raw) if (!receipts.has(key)) receipts.set(key, value);
    }
  } catch {
    // Provenance enrichment is supplemental. A temporary R2 read failure must never hide the
    // canonical history response that is already available to the parent.
  }

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Brick-History-Provenance", "phase8-v1");
  return new Response(JSON.stringify({
    ...body,
    points: applyReceipts(body.points, receipts),
    displayPoints: applyReceipts(body.displayPoints, receipts),
    historyProvenance: {
      eventTimeField: "wallTimeMs",
      serverReceiptField: "serverReceivedAtMs",
      receiptsAvailable: receipts.size
    }
  }), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
