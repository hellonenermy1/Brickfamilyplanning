import type { BrickDevice } from "./device-do";
import { evaluateSafety } from "./phase4";
import type { LivePacket } from "./protocol";
import { encodeTrustedDelta, gzipJson, readJsonObject, trustedPoint } from "./history-codec";

type QueueLocation = { type: "location"; deviceId: string; packet: LivePacket };
type Env = {
  DB: D1Database;
  HISTORY: R2Bucket;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
};

type StoredRawSegment = {
  v?: number;
  deviceId?: string;
  segmentStartMs?: number;
  storedAt?: number;
  packets?: LivePacket[];
};

type Group = {
  deviceId: string;
  day: string;
  epoch: number;
  segmentStartMs: number;
  entries: { message: Message<unknown>; packet: LivePacket }[];
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

async function existingPackets(env: Env, key: string): Promise<LivePacket[]> {
  const obj = await env.HISTORY.get(key);
  if (!obj) return [];
  const parsed = await readJsonObject<StoredRawSegment>(obj);
  if (!Array.isArray(parsed.packets)) return [];
  return parsed.packets.filter(p => p && typeof p === "object" && Number.isSafeInteger(p.epoch) && Number.isSafeInteger(p.sequence));
}

function mergePackets(existing: LivePacket[], incoming: LivePacket[], epoch: number): LivePacket[] {
  const bySequence = new Map<number, LivePacket>();
  for (const packet of existing) if (packet.epoch === epoch) bySequence.set(packet.sequence, packet);
  for (const packet of incoming) if (packet.epoch === epoch) bySequence.set(packet.sequence, packet);
  const merged = [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
  if (merged.length > MAX_PACKETS_PER_SEGMENT) throw new Error("history segment packet bound exceeded");
  return merged;
}

export async function processHistoryBatch(batch: MessageBatch<unknown>, env: Env) {
  const groups = new Map<string, Group>();
  for (const message of batch.messages) {
    const body = message.body as Partial<QueueLocation> & { type?: string };
    if (body.type !== "location" || typeof body.deviceId !== "string" || !body.packet || typeof body.packet !== "object") {
      message.ack();
      continue;
    }
    const packet = body.packet as LivePacket;
    if (!Number.isFinite(packet.wallTimeMs) || packet.wallTimeMs <= 0 || !Number.isSafeInteger(packet.sequence) || packet.sequence < 0 || !Number.isSafeInteger(packet.epoch) || packet.epoch < 0) {
      message.ack();
      continue;
    }
    const start = segmentStart(packet.wallTimeMs);
    const day = new Date(start).toISOString().slice(0, 10);
    const key = `${body.deviceId}|${start}|${packet.epoch}`;
    let group = groups.get(key);
    if (!group) {
      group = { deviceId: body.deviceId, day, epoch: packet.epoch, segmentStartMs: start, entries: [] };
      groups.set(key, group);
    }
    group.entries.push({ message, packet });
  }

  // Wrangler config fixes Queue consumer concurrency at 1. That makes this deterministic
  // read-merge-write safe across invocations while retaining at-least-once retries.
  for (const group of groups.values()) {
    try {
      group.entries.sort((a, b) => a.packet.sequence - b.packet.sequence);
      const keys = segmentKeys(group);
      const oldPackets = await existingPackets(env, keys.raw);
      const merged = mergePackets(oldPackets, group.entries.map(x => x.packet), group.epoch);
      const storedAt = Date.now();
      const points = merged.map(trustedPoint);
      const [rawBody, trustedBody] = await Promise.all([
        gzipJson({ v: 3, deviceId: group.deviceId, segmentStartMs: group.segmentStartMs, storedAt, packets: merged }),
        gzipJson({ v: 3, deviceId: group.deviceId, segmentStartMs: group.segmentStartMs, storedAt, delta: encodeTrustedDelta(points) })
      ]);

      await Promise.all([
        env.HISTORY.put(keys.raw, rawBody, {
          httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
          customMetadata: { deviceId: group.deviceId, day: group.day, kind: "raw", codec: "json-gzip-v3", segmentMinutes: "15", epoch: String(group.epoch) }
        }),
        env.HISTORY.put(keys.trusted, trustedBody, {
          httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
          customMetadata: { deviceId: group.deviceId, day: group.day, kind: "trusted", codec: "delta-gzip-v3", segmentMinutes: "15", epoch: String(group.epoch) }
        })
      ]);

      // Safety evaluation is independently sequence/idempotency guarded. If the queue retries after
      // R2 succeeded but before ACK, re-running these packets cannot duplicate a logical alert.
      const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(group.deviceId));
      for (const entry of group.entries) {
        const events = await evaluateSafety(env, group.deviceId, entry.packet);
        for (const event of events) await stub.pushSafetyEvent(event);
      }
      for (const entry of group.entries) entry.message.ack();
    } catch {
      for (const entry of group.entries) entry.message.retry();
    }
  }
}
