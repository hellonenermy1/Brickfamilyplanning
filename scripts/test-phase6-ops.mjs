import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [batteryPath, backupPath] = process.argv.slice(2);
if (!batteryPath || !backupPath) throw new Error('usage: test-phase6-ops.mjs <battery-module> <backup-module>');
const battery = await import(pathToFileURL(batteryPath).href + `?v=${Date.now()}`);
const backup = await import(pathToFileURL(backupPath).href + `?v=${Date.now()}`);

const now = Date.UTC(2026, 9, 31, 6, 0, 0);
const samples = [];
function addWindow(start, end, startPct, ratePerHour) {
  for (let t = start; t <= end; t += 5 * 60_000) {
    const hours = (t - start) / 3_600_000;
    samples.push({ received_at: t, battery_pct: Math.max(0, Math.round(startPct - ratePerHour * hours)), charging: 0 });
  }
}
addWindow(now - 10 * 3_600_000, now - 3 * 3_600_000, 90, 1);
addWindow(now - 3 * 3_600_000, now, 80, 12);
samples.sort((a,b)=>a.received_at-b.received_at);

const batteryEnv = {
  DB: {
    prepare() {
      return { bind() { return { async all() { return { results: samples }; } }; } };
    }
  }
};
const trendResponse = await battery.batteryDrainTrend(batteryEnv, 'device-1', now);
assert.equal(trendResponse.status, 200);
const trend = await trendResponse.json();
assert.equal(trend.status, 'elevated');
assert.ok(trend.recent.ratePctPerHour >= 10);
assert.ok(trend.baseline.ratePctPerHour < trend.recent.ratePctPerHour / 2);
assert.ok(trend.recent.dropPct >= 5);

const backupRows = new Map();
const tableNames = [
  'devices','device_location_control','geofences','geofence_state','ble_anchors','trips','retention_settings',
  'safety_events','health_incidents','crash_reports','audit_log','device_replay_state'
];
for (const table of tableNames) backupRows.set(table, [{ marker: table }]);
const stored = new Map();
const backupEnv = {
  DB: {
    prepare(sql) {
      const match = sql.match(/SELECT \* FROM ([a-z_]+)/i);
      if (!match) throw new Error(`unexpected SQL: ${sql}`);
      const table = match[1];
      return { bind(limit, offset) { return { async all() { return { results: offset === 0 ? (backupRows.get(table) || []) : [] }; } }; } };
    }
  },
  HISTORY: {
    async put(key, body, options) { stored.set(key, { body, options }); },
    async list() { return { objects: [], truncated: false }; },
    async delete() {}
  }
};
const result = await backup.snapshotD1ToR2(backupEnv, now);
assert.equal(result.key, 'backups/d1/2026-10-31.json.gz');
assert.match(result.sha256, /^[0-9a-f]{64}$/);
const object = stored.get(result.key);
assert.ok(object);
assert.equal(object.options.httpMetadata.contentEncoding, 'gzip');
assert.equal(object.options.customMetadata.sha256, result.sha256);

const validated = await backup.validateBackupBody(object.body, result.sha256);
assert.equal(validated.format, 'brick-d1-snapshot-v1');
assert.deepEqual(Object.keys(validated.tables), tableNames);
assert.equal(validated.tables.devices[0].marker, 'devices');
assert.equal(validated.tables.device_location_control[0].marker, 'device_location_control');
assert.equal(validated.tables.ble_anchors[0].marker, 'ble_anchors');
assert.ok(validated.excludes.some(x => x.startsWith('device_health_samples:')));
assert.ok(!('device_health_samples' in validated.tables));
assert.ok(!('device_events' in validated.tables));

const corrupted = object.body.slice(0);
new Uint8Array(corrupted)[Math.floor(corrupted.byteLength / 2)] ^= 0x01;
await assert.rejects(() => backup.validateBackupBody(corrupted, result.sha256), /integrity hash mismatch/);
await assert.rejects(() => backup.validateBackupBody(object.body, '0'.repeat(64)), /integrity hash mismatch/);

console.log('Phase 8 battery trend + private R2 backup integrity including persistent location-control state OK');
