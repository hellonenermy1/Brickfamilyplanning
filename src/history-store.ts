import type { BrickDevice } from "./device-do";
import { evaluateSafety } from "./phase4";
import type { LivePacket } from "./protocol";

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

function trustedPoint(p: LivePacket) {
  return {
    epoch: p.epoch,
    sequence: p.sequence,
    wallTimeMs: p.wallTimeMs,
    trustedLatE7: p.trustedLatE7,
    trustedLonE7: p.trustedLonE7,
    uncertaintyCm: p.uncertaintyCm,
    speedCms: p.speedCms,
    speedAccuracyCms: p.speedAccuracyCms,
    bearingCdeg: p.bearingCdeg,
    batteryPct: p.batteryPct,
    charging: p.charging,
    activity: p.activity,
    activityConfidence: p.activityConfidence,
    quality: p.quality,
    source: p.source,
    fallback: p.fallback,
    rawAccepted: p.rawAccepted
  };
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
      const trusted = packets.map(trustedPoint);
      const minSeq = packets[0].sequence, maxSeq = packets[packets.length - 1].sequence;
      const safe = safeDeviceId(group.deviceId);
      const suffix = `${group.epoch}-${minSeq}-${maxSeq}.json`;
      const storedAt = Date.now();

      await Promise.all([
        env.HISTORY.put(
          `history/raw/${safe}/${group.day}/${suffix}`,
          JSON.stringify({ deviceId: group.deviceId, storedAt, packets }),
          { httpMetadata: { contentType: "application/json" }, customMetadata: { deviceId: group.deviceId, day: group.day, kind: "raw" } }
        ),
        env.HISTORY.put(
          `history/trusted/${safe}/${group.day}/${suffix}`,
          JSON.stringify({ deviceId: group.deviceId, storedAt, points: trusted }),
          { httpMetadata: { contentType: "application/json" }, customMetadata: { deviceId: group.deviceId, day: group.day, kind: "trusted" } }
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
