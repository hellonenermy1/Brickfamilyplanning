// Read-only outage eligibility, never a replacement for normal route validation.
// The body, device signature/lifecycle, immutable UUID identity and rate limiter
// are still checked by the actual handler after the capture guard commits.
import { readBoundedBody } from './bounded-body';
import { validateSafetyReplayWindow } from './device-json-security';
import { validSafetyEvent } from './index';
import { checkSafetyEventIdentity, validSafetyCoordinates } from './safety-event-write';
type Env = { DB: D1Database; DEVICE_RATE?: { limit(input: { key: string }): Promise<{ success: boolean }> } };
export async function captureUrgentRequestAllowed(req: Request, env: Env): Promise<boolean> {
  try {
    const match = new URL(req.url).pathname.match(/^\/api\/device\/([A-Za-z0-9_-]{1,128})\/event$/);
    if (req.method !== 'POST' || !match) return false;
    const deviceId = match[1];
    const bounded = await readBoundedBody(req.clone(), 8192);
    if (!bounded.ok || !bounded.body.byteLength) return false;
    const event: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bounded.body));
    if (!validSafetyEvent(event) || !validSafetyCoordinates(event) || !['sos_started', 'sos_cancelled'].includes(event.kind)) return false;
    const detailJson = JSON.stringify(event.detail ?? {});
    // Normal signed outbox retries retain the existing 30-day route window.
    // Only a fresh, as-yet unaccepted manual SOS may permanently poison capture.
    const now = Date.now();
    if (detailJson.length > 4096 || !Number.isSafeInteger(event.createdAtMs) || event.createdAtMs < now - 120000 || event.createdAtMs > now + 120000) return false;
    const active = await env.DB.prepare('SELECT id FROM devices WHERE id=?1 AND revoked_at IS NULL').bind(deviceId).first();
    if (!active || await validateSafetyReplayWindow(req, env, deviceId)) return false;
    const identity = await checkSafetyEventIdentity(env.DB, { id: event.eventId, deviceId, kind: event.kind, deviceCreatedAt: event.createdAtMs, serverCreatedAt: now, latitude: event.latitude ?? null, longitude: event.longitude ?? null, accuracyM: event.accuracyM ?? null, detailJson });
    if (identity !== 'absent' || !env.DEVICE_RATE || typeof env.DEVICE_RATE.limit !== 'function') return false;
    return (await env.DEVICE_RATE.limit({ key: deviceId + ':capture-urgent' })).success === true;
  } catch { return false; }
}
