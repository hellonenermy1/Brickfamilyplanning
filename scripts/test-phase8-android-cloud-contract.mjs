import fs from 'node:fs';

const [androidApiPath, androidCommandStorePath, androidCommandTestPath, cloudProtocolPath, cloudIngestPath, cloudSafetyPath, cloudReplayPath, cloudControlPath] = process.argv.slice(2);
if (![androidApiPath, androidCommandStorePath, androidCommandTestPath, cloudProtocolPath, cloudIngestPath, cloudSafetyPath, cloudReplayPath, cloudControlPath].every(Boolean)) {
  throw new Error('usage: test-phase8-android-cloud-contract.mjs <BrickApi.kt> <ParentLocationState.kt> <Phase6LocationCommandInstrumentedTest.kt> <protocol.ts> <location-ingest-v6.ts> <index.ts> <device-json-security.ts> <phase6-location-control.ts>');
}

const android = fs.readFileSync(androidApiPath, 'utf8');
const androidCommandStore = fs.readFileSync(androidCommandStorePath, 'utf8');
const androidCommandTest = fs.readFileSync(androidCommandTestPath, 'utf8');
const protocol = fs.readFileSync(cloudProtocolPath, 'utf8');
const ingest = fs.readFileSync(cloudIngestPath, 'utf8');
const safety = fs.readFileSync(cloudSafetyPath, 'utf8');
const replay = fs.readFileSync(cloudReplayPath, 'utf8');
const control = fs.readFileSync(cloudControlPath, 'utf8');

function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}
function numberFrom(source, regex, label) {
  const match = source.match(regex);
  if (!match) throw new Error(`cannot read ${label}`);
  return Number(match[1].replaceAll('_', ''));
}

// Binary location protocol: the client framing and cloud decoder must stay byte-for-byte compatible.
const androidV2 = numberFrom(android, /LOCATION_V2_BYTES\s*=\s*([0-9_]+)/, 'Android V2 packet bytes');
const cloudV2 = numberFrom(protocol, /export const V2_BYTES\s*=\s*([0-9_]+)/, 'cloud V2 packet bytes');
if (androidV2 !== cloudV2 || cloudV2 !== 90) throw new Error(`V2 packet size drift: Android=${androidV2}, cloud=${cloudV2}`);
const androidBatchVersion = numberFrom(android, /LOCATION_BATCH_VERSION:\s*Byte\s*=\s*([0-9_]+)/, 'Android batch version');
const cloudBatchVersion = numberFrom(ingest, /const BATCH_VERSION\s*=\s*([0-9_]+)/, 'cloud batch version');
if (androidBatchVersion !== cloudBatchVersion || cloudBatchVersion !== 1) throw new Error(`batch version drift: Android=${androidBatchVersion}, cloud=${cloudBatchVersion}`);
const androidMaxBatch = numberFrom(android, /MAX_LOCATION_HTTP_BATCH\s*=\s*([0-9_]+)/, 'Android max HTTP batch');
const cloudMaxBatch = numberFrom(ingest, /const MAX_BATCH\s*=\s*([0-9_]+)/, 'cloud max HTTP batch');
if (androidMaxBatch !== cloudMaxBatch || cloudMaxBatch !== 20) throw new Error(`batch size drift: Android=${androidMaxBatch}, cloud=${cloudMaxBatch}`);
for (const [source, text, message] of [
  [android, 'ByteBuffer.allocate(3 + items.size * LOCATION_V2_BYTES).order(ByteOrder.BIG_ENDIAN)', 'Android batch framing must remain version+u16-count+fixed V2 records'],
  [android, '.put(LOCATION_BATCH_VERSION).putShort(items.size.toShort())', 'Android must emit batch version then big-endian count'],
  [ingest, 'const count = view.getUint16(1, false);', 'cloud must decode the batch count as big-endian u16'],
  [ingest, 'body.byteLength !== 3 + count * V2_BYTES', 'cloud must enforce exact fixed-record batch length'],
  [ingest, 'if (packet.version !== 2', 'cloud batch path must require V2 packets'],
]) requireText(source, text, message);

// Every location route is signed by Android and authenticated against the registered device key.
for (const path of ['/api/device/$deviceId/location', '/api/device/$deviceId/location/batch', '/api/device/$deviceId/location/live']) {
  requireText(android, `"${path}"`, `Android location route missing: ${path}`);
}
requireText(android, 'c.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload))', 'Android single/live payload must be signed');
requireText(android, 'c.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(body))', 'Android batch body must be signed');
requireText(ingest, 'verifyDeviceSignature(publicKey, body, signature)', 'cloud location path must verify the registered device signature');
requireText(ingest, 'SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=?1', 'cloud location auth must bind signature to requested device ID and revocation state');

// ACK semantics are the durability boundary: Android may delete local records only when the cloud
// returns the same logical identity it submitted. Single ACK is sequence; batch ACK is exact epoch+sequence set.
requireText(android, 'return JSONObject(text).getLong("ack")', 'Android single upload must consume cloud sequence ACK');
requireText(ingest, 'ack: packet.sequence', 'cloud single upload must ACK the accepted sequence');
for (const marker of [
  'if (acks.length() != items.size) error("Batch ACK count mismatch")',
  'val expected = items.map { it.epoch to it.sequence }.toSet()',
  'if (actual.size != items.size || actual != expected) error("Batch ACK contents mismatch")'
]) requireText(android, marker, `Android durable batch ACK validation missing: ${marker}`);
requireText(ingest, 'acked: persisted.accepted', 'cloud batch ACK must return accepted logical packet identities');
requireText(ingest, 'accepted: packets.map(packet => ({ epoch: packet.epoch, sequence: packet.sequence }))', 'cloud batch ACK identity must remain epoch+sequence');

// Safety events use a durable logical eventId plus monotonic eventSequence, are signed, deduped in D1,
// and Android refuses a response that ACKs a different event.
for (const marker of [
  '.put("protocol", 1).put("eventId", eventId).put("eventSequence", eventSequence)',
  '"/api/device/$deviceId/event"',
  'c.setRequestProperty("X-Brick-Signature", DeviceKeys.sign(payload))',
  'if (ack != expectedEventId) error("Safety event ACK mismatch")'
]) requireText(android, marker, `Android safety contract missing: ${marker}`);
for (const marker of [
  'const eventSequence = verified.json.eventSequence;',
  'if (!safePositiveInteger(eventSequence)) return jsonError("missing safety event sequence", 400);',
  'verifyDeviceSignature(row.public_key_spki_b64, body, signature)'
]) requireText(replay, marker, `cloud safety anti-replay contract missing: ${marker}`);
for (const marker of [
  'INSERT OR IGNORE INTO safety_events',
  'const duplicate = (r.meta.changes ?? 0) === 0;',
  'return json({ ok: true, eventId: e.eventId, duplicate, receivedAt: now });'
]) requireText(safety, marker, `cloud safety durable ACK contract missing: ${marker}`);

// Parent location-control command compatibility. Server TTL must fit inside Android's acceptance
// window; the envelope fields, device binding and nonce format must remain aligned.
const androidCommandWindow = numberFrom(android, /MAX_COMMAND_DELIVERY_MS\s*=\s*([0-9_]+)\s*\*\s*60_000L/, 'Android command delivery minutes') * 60_000;
const cloudCommandTtl = numberFrom(control, /const DELIVERY_TTL_MS\s*=\s*([0-9_]+)\s*\*\s*60_000/, 'cloud command TTL minutes') * 60_000;
if (!(cloudCommandTtl > 0 && cloudCommandTtl <= androidCommandWindow)) {
  throw new Error(`command TTL incompatible: Android max=${androidCommandWindow}ms, cloud=${cloudCommandTtl}ms`);
}
for (const marker of ['protocol: 1', 'deviceId,', 'commandId: row.command_id', 'nonce: crypto.randomUUID()', 'desiredEnabled:', 'issuedAtMs: row.issued_at', 'expiresAtMs: now + DELIVERY_TTL_MS']) {
  requireText(control, marker, `cloud location-command envelope missing: ${marker}`);
}
for (const marker of [
  'val protocol = j.optInt("protocol", -1)',
  'val deviceId = j.optString("deviceId", "")',
  'val commandId = j.optString("commandId", "")',
  'val nonce = j.optString("nonce", "")',
  'val desiredValue = j.opt("desiredEnabled")',
  'val issuedAtMs = j.optLong("issuedAtMs", -1L)',
  'val expiresAtMs = j.optLong("expiresAtMs", -1L)',
  'expiresAtMs - nowMs > MAX_COMMAND_DELIVERY_MS'
]) requireText(android, marker, `Android location-command parser missing: ${marker}`);

// Replay resistance is deliberately two-sided. Android durably rejects duplicate command IDs,
// duplicate nonces and non-increasing issuedAt; cloud stops reissuing the current command after ACK.
for (const marker of [
  'if (previousId == commandId || previousNonce == nonce || issuedAtMs <= previousIssuedAt) return false',
  '.putString(KEY_COMMAND_ID, commandId)',
  '.putString(KEY_NONCE, nonce)',
  '.putLong(KEY_ISSUED_AT_MS, issuedAtMs)',
  '.commit()'
]) requireText(androidCommandStore, marker, `Android durable command replay guard missing: ${marker}`);
requireText(control, 'if (row.last_acked_command_id === row.command_id)', 'cloud must suppress an already-ACKed current command');
requireText(control, 'last_acked_command_id=CASE WHEN command_id=?3 THEN ?3 ELSE last_acked_command_id END', 'cloud ACK must apply only to the still-current command');
for (const marker of ['testValidDeviceBoundCommandIsParsed', 'testMalformedExpiredOrAmbiguousDeliveryIsRejected', 'futureIssued']) {
  requireText(androidCommandTest, marker, `Android command instrumentation coverage missing: ${marker}`);
}

console.log(`Phase 8 Android↔cloud contract PASS: V2=${cloudV2} bytes, batch v${cloudBatchVersion}/${cloudMaxBatch}, exact ACK identities, signed safety events, and two-sided command replay resistance.`);
