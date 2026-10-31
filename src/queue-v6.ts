type QueueEnv = { DB: D1Database };

type SafetyReceipt = {
  type: "safety_receipt";
  deviceId: string;
  eventId: string;
  kind: string;
  createdAtMs: number;
};

type QueueBody = Partial<SafetyReceipt> & { type?: string; deviceId?: string };

function safeDeviceId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}

function safeEventId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F-]{36}$/.test(value);
}

export async function processSafetyReceipts(batch: MessageBatch<unknown>, env: QueueEnv) {
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
      if (row?.ok === 1) message.ack();
      else message.retry();
    } catch {
      message.retry();
    }
  }
}

export async function processDeadLetterBatch(batch: MessageBatch<unknown>, env: QueueEnv) {
  const now = Date.now();
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
      const queueName = (batch as MessageBatch<unknown> & { queue?: string }).queue ?? "unknown";
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
      message.ack();
    } catch {
      // The DLQ itself is the final durable retry layer. Do not acknowledge until the incident is stored.
      message.retry();
    }
  }
}
