import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('Usage: node scripts/test-phase5-ops.mjs <bundled-module>');
const { classifyHealth } = await import(pathToFileURL(target).href);

function base(overrides = {}) {
  return {
    protocol: 1,
    elapsedRealtimeMs: 100000,
    serviceUptimeMs: 90000,
    locationAgeMs: 3000,
    ackAgeMs: 2000,
    pendingRecords: 0,
    pendingSafetyEvents: 0,
    oldestPendingAgeMs: null,
    network: 'wifi',
    locationEnabled: true,
    locationSubscribed: true,
    managed: true,
    recoveryCount: 0,
    appVersion: '0.5.0-phase5',
    trackingIntervalMs: 5000,
    serviceActive: true,
    fineLocationPermission: true,
    backgroundLocationPermission: true,
    activityRecognitionPermission: true,
    batteryOptimizationExempt: true,
    backgroundRestricted: false,
    networkValidated: true,
    ...overrides
  };
}

let c = classifyHealth(base());
assert.equal(c.status, 'healthy');
assert.equal(c.reason, 'ok');
assert.equal(c.positionAvailable, true);

c = classifyHealth(base({ fineLocationPermission: false }));
assert.equal(c.status, 'degraded');
assert.equal(c.reason, 'fine_location_permission_missing');
assert.equal(c.severity, 'critical');

c = classifyHealth(base({ locationEnabled: false }));
assert.equal(c.reason, 'location_disabled');
assert.equal(c.positionAvailable, false);

c = classifyHealth(base({ backgroundRestricted: true }));
assert.equal(c.reason, 'background_execution_restricted');
assert.equal(c.severity, 'warning');

c = classifyHealth(base({ network: 'mobile', networkValidated: false }));
assert.equal(c.reason, 'network_unavailable');

c = classifyHealth(base({ pendingSafetyEvents: 1, oldestPendingAgeMs: 61000 }));
assert.equal(c.reason, 'safety_event_backlog');
assert.equal(c.severity, 'critical');

c = classifyHealth(base({ locationAgeMs: 70000 }));
assert.equal(c.reason, 'position_unavailable');
assert.equal(c.positionAvailable, false);

console.log('Phase 5 health classifier regression tests OK');
