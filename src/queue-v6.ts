import { processHistoryBatch, type QueueMessageView } from "./history-store";

type QueueEnv = { DB: D1Database; HISTORY: R2Bucket };

type SafetyReceipt = {
  type: "safety_receipt";
  deviceId: string;
  eventId: string;
  kind: string;
  createdAtMs: number;
};

type QueueBody = Partial<SafetyReceipt> & { type?: string; deviceId?: string };

type QueueWorkResult = {
  succeededDeviceIds: Set<string>;
  retriedDeviceIds: Set<string>;
};

function safeDeviceId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}

function safeEventId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F-]{36}$/.test(value);
}

export async function processSafetyReceipts(batch: QueueMessageView, env: QueueEnv): Promise<QueueWorkResult> {
  const result: QueueWorkResult = { succeededDeviceIds: new Set<string>(), retriedDeviceIds: new Set<string>() };
  for (const message of batch.messages) {
    const body = message.body as QueueBody;
    if (body?.type !== "safety_receipt") continue;
    if (!safeDeviceId(body.deviceId) || !safeEventId(body.eventId)) {
      message.ack();
      continue;
    }
    try {
      const row = await env.DB.prepare(
        "SELECT 1 AS ok FROM safety_events WHERE id=?1 AND device_id=?2 LIMIT 1"
      ).bind(body.eventId, body.deviceId).first<{ ok: number }>();
      if (row?.ok === 1) {
        message.ack();
        result.succeededDeviceIds.add(body.deviceId);
      } else {
        message.retry();
        result.retriedDeviceIds.add(body.deviceId);
      }
    } catch {
      message.retry();
      result.retriedDeviceIds.add(body.deviceId);
    }
  }
  return result;
}

async function recordBackendFailure(env: QueueEnv, deviceId: string, batch: MessageBatch<unknown>, body: QueueBody, now: number) {
  const queueName = batch.queue ?? "unknown";
  const detail = JSON.stringify({
    queue: queueName,
    messageType: typeof body.type === "string" ? body.type.slice(0, 64) : "unknown",
    eventId: safeEventId(body.eventId) ? body.eventId : null
  });
  const open = await env.DB.prepare(
    "SELECT id FROM health_incidents WHERE device_id=?1 AND kind='backend_processing_failed' AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
  ).bind(deviceId).first<{ id: string }>();
  const statements = [
    env.DB.prepare("UPDATE devices SET health_status='degraded' WHERE id=?1").bind(deviceId)
  ];
  if (open) {
    statements.push(env.DB.prepare(
      "UPDATE health_incidents SET last_seen_at=?1,severity='critical',detail_json=?2 WHERE id=?3 AND ended_at IS NULL"
    ).bind(now, detail, open.id));
  } else {
    statements.push(env.DB.prepare(
      "INSERT INTO health_incidents(id,device_id,kind,severity,started_at,last_seen_at,detail_json) VALUES(?1,?2,'backend_processing_failed','critical',?3,?3,?4)"
    ).bind(crypto.randomUUID(), deviceId, now, detail));
  }
  await env.DB.batch(statements);
}

async function closeRecoveredBackendFailure(env: QueueEnv, deviceId: string, now: number) {
  await env.DB.prepare(
    "UPDATE health_incidents SET ended_at=?1,last_seen_at=?1,auto_recovered=1 WHERE device_id=?2 AND kind='backend_processing_failed' AND ended_at IS NULL"
  ).bind(now, deviceId).run();
}

export async function processDeadLetterBatch(batch: MessageBatch<unknown>, env: QueueEnv) {
  const now = Date.now();
  const eligible: Message<unknown>[] = [];
  const affectedDeviceIds = new Set<string>();

  // First persist visible failure evidence. A valid DLQ payload is deliberately NOT acknowledged
  // here: the original work still has to succeed before the Queue message may disappear.
  for (const message of batch.messages) {
    const body = message.body as QueueBody;
    const deviceId = body?.deviceId;
    if (!safeDeviceId(deviceId)) {
      message.ack();
      continue;
    }
    try {
      const device = await env.DB.prepare("SELECT id FROM devices WHERE id=?1").bind(deviceId).first();
      if (!device) {
        message.ack();
        continue;
      }
      await recordBackendFailure(env, deviceId, batch, body, now);
      affectedDeviceIds.add(deviceId);
      eligible.push(message);
    } catch {
      // If Brick cannot even persist the failure evidence, preserve the Queue message for retry.
      message.retry();
    }
  }

  if (!eligible.length) return;

  // Re-run the actual durable work instead of treating the DLQ as a logging sink. This is the
  // critical guarantee: a location that failed R2 processing is ACKed only after R2 succeeds, and
  // a safety receipt is ACKed only after its durable safety row is present in D1.
  const eligibleBatch: QueueMessageView = { messages: eligible };
  const safety = await processSafetyReceipts(eligibleBatch, env);
  const history = await processHistoryBatch(eligibleBatch, env);
  const retried = new Set<string>([...safety.retriedDeviceIds, ...history.retriedDeviceIds]);
  const succeeded = new Set<string>([...safety.succeededDeviceIds, ...history.succeededDeviceIds]);

  // Close only when this delivery actually completed useful durable work for the device and no
  // message for that same device requested another retry in this batch. Malformed/unknown payloads
  // remain visible as backend incidents instead of being falsely labelled recovered.
  for (const deviceId of affectedDeviceIds) {
    if (succeeded.has(deviceId) && !retried.has(deviceId)) {
      try { await closeRecoveredBackendFailure(env, deviceId, Date.now()); }
      catch { /* data is already durable; leave the incident open rather than faking recovery */ }
    }
  }
}
