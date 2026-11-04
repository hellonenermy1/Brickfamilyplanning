import type { LivePacket } from "./protocol";
import { encodeTrustedDelta, gzipJson, readJsonObject, trustedPoint } from "./history-codec";

type QueueBody = { type?: string; deviceId?: string; packet?: LivePacket; rawPacket?: LivePacket; receivedAtMs?: number };
type Env = { HISTORY: R2Bucket };
export type QueueMessageView = { messages: readonly Message<unknown>[] };
type ReceiptRow = [number, number];

type StoredRawSegment = {
  v?: number;
  deviceId?: string;
  segmentStartMs?: number;
  storedAt?: number;
  packets?: LivePacket[];
  trustedPackets?: LivePacket[];
  receipts?: ReceiptRow[];
};

type Group = {
  deviceId: string;
  day: string;
  epoch: number;
  segmentStartMs: number;
  entries: { message: Message<unknown>; packet: LivePacket; rawPacket: LivePacket; receivedAtMs: number | null }[];
};

export type HistoryBatchResult = {
  succeededDeviceIds: Set<string>;
  retriedDeviceIds: Set<string>;
  processedMessages: number;
  retriedMessages: number;
  ignoredMessages: number;
};

const SEGMENT_MS = 15 * 60 * 1000;
const MAX_PACKETS_PER_SEGMENT = 40_000;
// Two consumers can process one 15-minute object concurrently. Never ACK a stale
// read-modify-write; force re-read/merge after an R2 conditional-write conflict.
const MAX_R2_MERGE_ATTEMPTS = 8;

function safeDeviceId(id: string) { return id.replace(/[^a-zA-Z0-9_-]/g, "_"); }
function segmentStart(ms: number) { return Math.floor(ms / SEGMENT_MS) * SEGMENT_MS; }
function hhmm(ms: number) {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}-${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function segmentKeys(group: Group) {
  const safe = safeDeviceId(group.deviceId);
  const stem = `${hhmm(group.segmentStartMs)}-e${group.epoch}.json.gz`;
  return {
    raw: `history/raw/${safe}/${group.day}/${stem}`,
    trusted: `history/trusted/${safe}/${group.day}/${stem}`
  };
}

function validPacket(p: unknown): p is LivePacket {
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  const x = p as Partial<LivePacket>;
  const coord = (v: unknown, limit: number) => v === null || (Number.isSafeInteger(v) && Math.abs(v as number) <= limit);
  const optionalInt = (v: unknown) => v === null || Number.isSafeInteger(v);
  // Queue messages are internal, not necessarily trustworthy: poison or corrupted
  // payloads must not reach R2 as an unreadable trusted-history delta segment.
  return (x.version === 1 || x.version === 2) &&
    Number.isSafeInteger(x.epoch) && x.epoch! >= 0 &&
    Number.isSafeInteger(x.sequence) && x.sequence! > 0 &&
    Number.isSafeInteger(x.wallTimeMs) && x.wallTimeMs! > 0 &&
    coord(x.trustedLatE7, 900_000_000) && coord(x.trustedLonE7, 1_800_000_000) &&
    (x.trustedLatE7 === null) === (x.trustedLonE7 === null) &&
    Number.isSafeInteger(x.uncertaintyCm) && x.uncertaintyCm! >= 0 && x.uncertaintyCm! <= 50_000_000 &&
    Number.isSafeInteger(x.batteryPct) && x.batteryPct! >= 0 && x.batteryPct! <= 100 &&
    typeof x.charging === "boolean" && typeof x.fallback === "boolean" && typeof x.rawAccepted === "boolean" &&
    Number.isSafeInteger(x.activity) && x.activity! >= 0 && x.activity! <= 5 &&
    Number.isSafeInteger(x.activityConfidence) && x.activityConfidence! >= 0 && x.activityConfidence! <= 100 &&
    Number.isSafeInteger(x.quality) && x.quality! >= 1 && x.quality! <= 7 &&
    Number.isSafeInteger(x.source) && x.source! >= 0 && x.source! <= 6 &&
    optionalInt(x.speedCms) && optionalInt(x.speedAccuracyCms) && optionalInt(x.bearingCdeg);
}

function validReceipt(value: unknown): value is ReceiptRow {
  return Array.isArray(value) && value.length === 2 && Number.isSafeInteger(value[0]) && value[0] > 0 &&
    Number.isSafeInteger(value[1]) && value[1] > 0;
}

async function existingSegment(env: Env, key: string): Promise<{ etag: string | null; raw: LivePacket[]; trusted: LivePacket[]; receipts: ReceiptRow[] }> {
  const obj = await env.HISTORY.get(key);
  if (!obj) return { etag: null, raw: [], trusted: [], receipts: [] };
  const parsed = await readJsonObject<StoredRawSegment>(obj);
  const raw = Array.isArray(parsed.packets) ? parsed.packets.filter(validPacket) : [];
  const trusted = Array.isArray(parsed.trustedPackets) ? parsed.trustedPackets.filter(validPacket) : raw;
  const receipts = Array.isArray(parsed.receipts) ? parsed.receipts.filter(validReceipt) : [];
  return { etag: obj.etag, raw, trusted, receipts };
}
/** If-None-Match is required for the first write; an empty R2Conditional is NOT a create-only guard. */
function onlyIfUnchanged(etag: string | null): R2Conditional | Headers {
  return etag === null ? new Headers({ "If-None-Match": "*" }) : { etagMatches: etag };
}

function mergePackets(existing: LivePacket[], incoming: LivePacket[], epoch: number): LivePacket[] {
  const bySequence = new Map<number, LivePacket>();
  // D1 treats (device,epoch,sequence) as an immutable logical identity. Queue
  // delivery and HTTP retries MUST NOT rewrite its first committed R2 coordinates.
  // Preserve existing state; within one batch the first observed copy also wins.
  for (const packet of existing) if (packet.epoch === epoch && !bySequence.has(packet.sequence)) bySequence.set(packet.sequence, packet);
  for (const packet of incoming) if (packet.epoch === epoch && !bySequence.has(packet.sequence)) bySequence.set(packet.sequence, packet);
  const merged = [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
  if (merged.length > MAX_PACKETS_PER_SEGMENT) throw new Error("history segment packet bound exceeded");
  return merged;
}

function mergeReceipts(existing: ReceiptRow[], entries: Group["entries"], packets: LivePacket[]): ReceiptRow[] {
  const allowed = new Set(packets.map(packet => packet.sequence));
  const bySequence = new Map<number, number>();
  for (const [sequence, receivedAtMs] of existing) {
    if (!allowed.has(sequence)) continue;
    const current = bySequence.get(sequence);
    if (current === undefined || receivedAtMs < current) bySequence.set(sequence, receivedAtMs);
  }
  for (const entry of entries) {
    if (entry.receivedAtMs === null || !allowed.has(entry.packet.sequence)) continue;
    const current = bySequence.get(entry.packet.sequence);
    // First server receipt is the provenance we care about. HTTP/Queue retries may only preserve or
    // improve that timestamp, never make an old packet look newer.
    if (current === undefined || entry.receivedAtMs < current) bySequence.set(entry.packet.sequence, entry.receivedAtMs);
  }
  return [...bySequence.entries()].sort((a, b) => a[0] - b[0]);
}

function originalForQueue(body: QueueBody, packet: LivePacket): LivePacket {
  const raw = body.rawPacket;
  if (!validPacket(raw)) return packet;
  if (raw.epoch !== packet.epoch || raw.sequence !== packet.sequence || raw.wallTimeMs !== packet.wallTimeMs) return packet;
  return raw;
}

export async function processHistoryBatch(batch: QueueMessageView, env: Env): Promise<HistoryBatchResult> {
  const groups = new Map<string, Group>();
  const result: HistoryBatchResult = {
    succeededDeviceIds: new Set<string>(),
    retriedDeviceIds: new Set<string>(),
    processedMessages: 0,
    retriedMessages: 0,
    ignoredMessages: 0
  };

  for (const message of batch.messages) {
    const body = message.body as QueueBody | null | undefined;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      message.ack();
      result.ignoredMessages += 1;
      continue;
    }
    // Safety receipts are handled by queue-v6. Do not ACK here because that handler may have
    // deliberately requested a retry while waiting for the durable safety row to appear.
    if (body.type === "safety_receipt") {
      result.ignoredMessages += 1;
      continue;
    }
    if (body.type !== "location" || typeof body.deviceId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(body.deviceId) || !validPacket(body.packet)) {
      message.ack();
      result.ignoredMessages += 1;
      continue;
    }
    const packet = body.packet;
    if (!Number.isFinite(packet.wallTimeMs) || packet.wallTimeMs <= 0 || !Number.isSafeInteger(packet.sequence) || packet.sequence <= 0 || !Number.isSafeInteger(packet.epoch) || packet.epoch < 0) {
      message.ack();
      result.ignoredMessages += 1;
      continue;
    }
    const rawPacket = originalForQueue(body, packet);
    const receivedAtMs = Number.isSafeInteger(body.receivedAtMs) && body.receivedAtMs! > 0 ? body.receivedAtMs! : null;
    const start = segmentStart(packet.wallTimeMs);
    const day = new Date(start).toISOString().slice(0, 10);
    const key = `${body.deviceId}|${start}|${packet.epoch}`;
    let group = groups.get(key);
    if (!group) {
      group = { deviceId: body.deviceId, day, epoch: packet.epoch, segmentStartMs: start, entries: [] };
      groups.set(key, group);
    }
    group.entries.push({ message, packet, rawPacket, receivedAtMs });
  }

  for (const group of groups.values()) {
    try {
      group.entries.sort((a, b) => a.packet.sequence - b.packet.sequence);
      const keys = segmentKeys(group);
      let persisted = false;
      for (let attempt = 0; attempt < MAX_R2_MERGE_ATTEMPTS; attempt++) {
        // R2 is strongly consistent, but an ordinary unconditional put would still
        // erase the other writer's additions after both read the same generation.
        const [old, trustedHead] = await Promise.all([
          existingSegment(env, keys.raw),
          env.HISTORY.head(keys.trusted)
        ]);
        const rawPackets = mergePackets(old.raw, group.entries.map(x => x.rawPacket), group.epoch);
        const trustedPackets = mergePackets(old.trusted, group.entries.map(x => x.packet), group.epoch);
        const receipts = mergeReceipts(old.receipts, group.entries, trustedPackets);
        const storedAt = Date.now();
        const points = trustedPackets.map(trustedPoint);
        const [rawBody, trustedBody] = await Promise.all([
          gzipJson({
            v: 5,
            deviceId: group.deviceId,
            segmentStartMs: group.segmentStartMs,
            storedAt,
            packets: rawPackets,
            trustedPackets,
            receipts
          }),
          gzipJson({ v: 5, deviceId: group.deviceId, segmentStartMs: group.segmentStartMs, storedAt, receipts, delta: encodeTrustedDelta(points) })
        ]);

        // These are TWO separate objects, not an atomic two-object transaction.
        // Wait for BOTH writes before deciding whether to retry, even if one failed.
        // A partial write is reconciled from the raw source of truth on the next try.
        const writes = await Promise.allSettled([
          env.HISTORY.put(keys.raw, rawBody, {
            onlyIf: onlyIfUnchanged(old.etag),
            httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
            customMetadata: { deviceId: group.deviceId, day: group.day, kind: "raw", codec: "json-gzip-v5", segmentMinutes: "15", epoch: String(group.epoch) }
          }),
          env.HISTORY.put(keys.trusted, trustedBody, {
            onlyIf: onlyIfUnchanged(trustedHead?.etag ?? null),
            httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
            customMetadata: { deviceId: group.deviceId, day: group.day, kind: "trusted", codec: "delta-gzip-v5", segmentMinutes: "15", epoch: String(group.epoch) }
          })
        ]);
        const failed = writes.find((write): write is PromiseRejectedResult => write.status === "rejected");
        if (failed) throw failed.reason;
        if (writes.every(write => write.status === "fulfilled" && write.value !== null)) {
          persisted = true;
          break;
        }
        // Conditional write lost to a competing consumer. Re-read the committed
        // generation instead of accepting an ACK or overwriting without checking.
      }
      if (!persisted) throw new Error("R2 history conditional-merge retry exhausted");

      for (const entry of group.entries) {
        entry.message.ack();
        result.processedMessages += 1;
      }
      result.succeededDeviceIds.add(group.deviceId);
    } catch {
      for (const entry of group.entries) {
        entry.message.retry();
        result.retriedMessages += 1;
      }
      result.retriedDeviceIds.add(group.deviceId);
    }
  }

  return result;
}
