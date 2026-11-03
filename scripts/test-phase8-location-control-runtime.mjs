import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [modulePath] = process.argv.slice(2);
if (!modulePath) throw new Error('usage: test-phase8-location-control-runtime.mjs <bundled-location-control>');
const control = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

const deviceId = '11111111-1111-4111-8111-111111111111';
const commandId = '22222222-2222-4222-8222-222222222222';

function envWith(row) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                assert.match(sql, /FROM device_location_control/);
                assert.deepEqual(args, [deviceId]);
                return row;
              }
            };
          }
        };
      }
    }
  };
}

function baseResponse() {
  return new Response(JSON.stringify({ ok: true, receivedAt: 1234 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

const unacked = {
  desired_enabled: 0,
  command_id: commandId,
  issued_at: Date.now() - 30_000,
  last_actual_enabled: 1,
  last_actual_at: Date.now() - 60_000,
  last_acked_command_id: null
};
const before = Date.now();
let response = await control.augmentHealthWithLocationControl(baseResponse(), envWith(unacked), deviceId);
const after = Date.now();
let body = await response.json();
assert.equal(body.ok, true);
assert.ok(body.locationCommand, 'unacknowledged current command must be delivered');
assert.equal(body.locationCommand.protocol, 1);
assert.equal(body.locationCommand.deviceId, deviceId);
assert.equal(body.locationCommand.commandId, commandId);
assert.equal(body.locationCommand.desiredEnabled, false);
assert.equal(body.locationCommand.issuedAtMs, unacked.issued_at);
assert.match(body.locationCommand.nonce, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.ok(body.locationCommand.expiresAtMs >= before + 5 * 60_000);
assert.ok(body.locationCommand.expiresAtMs <= after + 5 * 60_000);
assert.equal(response.headers.get('Cache-Control'), 'no-store');

// If a different old command was ACKed, the current command is still pending and must be delivered.
response = await control.augmentHealthWithLocationControl(
  baseResponse(),
  envWith({ ...unacked, last_acked_command_id: '33333333-3333-4333-8333-333333333333' }),
  deviceId
);
body = await response.json();
assert.equal(body.locationCommand.commandId, commandId);

// Once the authenticated phone ACKs this exact logical command, the server must stop minting fresh
// nonces for it. This is the server half of replay resistance; Android separately stores command ID,
// nonce and issuedAt high-water state and rejects duplicate/stale deliveries.
response = await control.augmentHealthWithLocationControl(
  baseResponse(),
  envWith({ ...unacked, last_acked_command_id: commandId }),
  deviceId
);
body = await response.json();
assert.equal(body.ok, true);
assert.equal(body.locationCommand, undefined, 'already-ACKed command must not be re-delivered');

console.log('Phase 8 location-control runtime: pending command delivered, old ACK ignored, current ACK suppresses replay');
