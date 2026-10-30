import type { BrickDevice } from "./device-do";
import { evaluateSafety } from "./phase4";
import type { LivePacket } from "./protocol";
import { encodeTrustedDelta, gzipJson, sequenceFingerprint, trustedPoint } from "./history-codec";

type QueueLocation = { type: "location"; deviceId: string; packet: LivePacket };
type Env = {
  DB: D1Database;
  HISTORY: R2Bucket;
  BRICK_DEVICE: DurableObjectNamespace<BrickDevice>;
};

type Group = {
  deviceId: string;
  day: string;
  epoch: number;
  entries: { message: Message<unknown>; packet: LivePacket }[];
};

function safeDeviceId(id: string) { return id.replace(/[^a-zA-Z0-9_-]/g, "_"); }

export async function processHistoryBatch(batch: MessageBatch<unknown>, env: Env) {
  const groups = new Map<string, Group>();
  for (const message of batch.messages) {
    const body = message.body as Partial<QueueLocation> & { type?: string };
    if (body.type !== "location" || typeof body.deviceId !== "string" || !body.packet || typeof body.packet !== "object") {
      message.ack();
      continue;
    }
    const packet = body.packet as LivePacket;
    if (!Number.isFinite(packet.wallTimeMs) || !Number.isFinite(packet.sequence) || !Number.isFinite(packet.epoch)) {
      message.ack();
      continue;
    }
    const day = new Date(packet.wallTimeMs).toISOString().slice(0, 10);
    const key = `${body.deviceId}|${day}|${packet.epoch}`;
    let group = groups.get(key);
    if (!group) {
      group = { deviceId: body.deviceId, day, epoch: packet.epoch, entries: [] };
      groups.set(key, group);
    }
    group.entries.push({ message, packet });
  }

  for (const group of groups.values()) {
    try {
      group.entries.sort((a, b) => a.packet.sequence - b.packet.sequence);
      const packets = group.entries.map(x => x.packet);
      const points = packets.map(trustedPoint);
      const minSeq = packets[0].sequence, maxSeq = packets[packets.length - 1].sequence;
      const fingerprint = await sequenceFingerprint(packets.map(p => p.sequence));
      const safe = safeDeviceId(group.deviceId);
      const suffix = `${group.epoch}-${minSeq}-${maxSeq}-${packets.length}-${fingerprint}.json.gz`;
      const storedAt = Date.now();
      const [rawBody, trustedBody] = await Promise.all([
        gzipJson({ v: 2, deviceId: group.deviceId, storedAt, packets }),
        gzipJson({ deviceId: group.deviceId, storedAt, delta: encodeTrustedDelta(points) })
      ]);

      await Promise.all([
        env.HISTORY.put(
          `history/raw/${safe}/${group.day}/${suffix}`,
          rawBody,
          { httpMetadata: { contentType: "application/json", contentEncoding: "gzip" }, customMetadata: { deviceId: group.deviceId, day: group.day, kind: "raw", codec: "json-gzip-v2" } }
        ),
        env.HISTORY.put(
          `history/trusted/${safe}/${group.day}/${suffix}`,
          trustedBody,
          { httpMetadata: { contentType: "application/json", contentEncoding: "gzip" }, customMetadata: { deviceId: group.deviceId, day: group.day, kind: "trusted", codec: "delta-gzip-v2" } }
        )
      ]);

      const stub = env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(group.deviceId));
      for (const packet of packets) {
        const events = await evaluateSafety(env, group.deviceId, packet);
        for (const event of events) await stub.pushSafetyEvent(event);
      }
      for (const entry of group.entries) entry.message.ack();
    } catch {
      for (const entry of group.entries) entry.message.retry();
    }
  }
}
