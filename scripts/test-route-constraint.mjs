import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [modulePath] = process.argv.slice(2);
if (!modulePath) throw new Error('usage: test-route-constraint.mjs <route-module>');
const mod = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

const road = [
  { a: [103.8000, 1.3000], b: [103.8100, 1.3000] },
  { a: [103.8200, 1.3100], b: [103.8200, 1.3200] }
];

const nearest = mod.nearestRoutePoint(103.8050, 1.3002, road);
assert.ok(nearest, 'expected a nearest road point');
assert.ok(Math.abs(nearest.lon - 103.8050) < 0.00002, nearest);
assert.ok(Math.abs(nearest.lat - 1.3000) < 0.00002, nearest);
assert.ok(nearest.distanceM > 15 && nearest.distanceM < 30, nearest);

const endpoint = mod.nearestRoutePoint(103.7990, 1.3000, [{ a: [103.8000, 1.3000], b: [103.8100, 1.3000] }]);
assert.ok(endpoint);
assert.ok(Math.abs(endpoint.lon - 103.8000) < 0.000001, endpoint);
assert.ok(endpoint.distanceM > 100, endpoint);

assert.equal(mod.nearestRoutePoint(103.8, 1.3, []), null);
console.log('Phase 6 route-constrained geometry OK');
