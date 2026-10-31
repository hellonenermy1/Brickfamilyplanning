import type { LivePacket } from "./protocol";
import { encodeTrustedDelta, gzipJson, readJsonObject, trustedPoint } from "./history-codec";

type QueueBody = { type?: string; deviceId?: string; packet?: LivePacket; rawPacket?: LivePacket };
type Env = { HISTORY: R2Bucket };
export type QueueMessageView = { messages: readonly Message<unknown>[] };

type StoredRawSegment = {
  v?: number;
  deviceId?: string;
  segmentStartMs?: number;
  storedAt?: number;
  packets?: LivePacket[];
  trustedPackets?: LivePacket[];
};

type Group = {
  deviceId: string;
  day: string;
  epoch: number;
  segmentStartMs: number;
  entries: { message: Message<unknown>; packet: LivePacket; rawPacket: LivePacket }[];
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
  if (!p || typeof p !== "object") return false;
  const x = p as Partial<LivePacket>;
  return Number.isSafeInteger(x.epoch) && Number.isSafeInteger(x.sequence) && Number.isSafeInteger(x.wallTimeMs);
}

async function existingSegment(env: Env, key: string): Promise<{ raw: LivePacket[]; trusted: LivePacket[] }> {
  const obj = await env.HISTORY.get(key);
  if (!obj) return { raw: [], trusted: [] };
  const parsed = await readJsonObject<StoredRawSegment>(obj);
  const raw = Array.isArray(parsed.packets) ? parsed.packets.filter(validPacket) : [];
  const trusted = Array.isArray(parsed.trustedPackets) ? parsed.trustedPackets.filter(validPacket) : raw;
  return { raw, trusted };
}

function mergePackets(existing: LivePacket[], incoming: LivePacket[], epoch: number): LivePacket[] {
  const bySequence = new Map<number, LivePacket>();
  for (const packet of existing) if (packet.epoch === epoch) bySequence.set(packet.sequence, packet);
  for (const packet of incoming) if (packet.epoch === epoch) bySequence.set(packet.sequence, packet);
  const merged = [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
  if (merged.length > MAX_PACKETS_PER_SEGMENT) throw new Error("history segment packet bound exceeded");
  return merged;
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
    const body = message.body as QueueBody;
    // Safety receipts are handled by queue-v6. Do not ACK here because that handler may have
    // deliberately requested a retry while waiting for the durable safety row to appear.
    if (body.type === "safety_receipt") {
      result.ignoredMessages += 1;
      continue;
    }
    if (body.type !== "location" || typeof body.deviceId !== "string" || !body.packet || typeof body.packet !== "object") {
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
    const start = segmentStart(packet.wallTimeMs);
    const day = new Date(start).toISOString().slice(0, 10);
    const key = `${body.deviceId}|${start}|${packet.epoch}`;
    let group = groups.get(key);
    if (!group) {
      group = { deviceId: body.deviceId, day, epoch: packet.epoch, segmentStartMs: start, entries: [] };
      groups.set(key, group);
    }
    group.entries.push({ message, packet, rawPacket });
  }

  for (const group of groups.values()) {
    try {
      group.entries.sort((a, b) => a.packet.sequence - b.packet.sequence);
      const keys = segmentKeys(group);
      const old = await existingSegment(env, keys.raw);
      const rawPackets = mergePackets(old.raw, group.entries.map(x => x.rawPacket), group.epoch);
      const trustedPackets = mergePackets(old.trusted, group.entries.map(x => x.packet), group.epoch);
      const storedAt = Date.now();
      const points = trustedPackets.map(trustedPoint);
      const [rawBody, trustedBody] = await Promise.all([
        gzipJson({
          v: 4,
          deviceId: group.deviceId,
          segmentStartMs: group.segmentStartMs,
          storedAt,
          packets: rawPackets,
          trustedPackets
        }),
        gzipJson({ v: 4, deviceId: group.deviceId, segmentStartMs: group.segmentStartMs, storedAt, delta: encodeTrustedDelta(points) })
      ]);

      await Promise.all([
        env.HISTORY.put(keys.raw, rawBody, {
          httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
          customMetadata: { deviceId: group.deviceId, day: group.day, kind: "raw", codec: "json-gzip-v4", segmentMinutes: "15", epoch: String(group.epoch) }
        }),
        env.HISTORY.put(keys.trusted, trustedBody, {
          httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
          customMetadata: { deviceId: group.deviceId, day: group.day, kind: "trusted", codec: "delta-gzip-v4", segmentMinutes: "15", epoch: String(group.epoch) }
        })
      ]);

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
