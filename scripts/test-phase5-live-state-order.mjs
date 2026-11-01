import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('usage: test-phase5-live-state-order.mjs <module>');
const order = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

assert.equal(order.shouldAdvanceLiveState({ epoch: 1, sequence: 1 }, null), true);
assert.equal(order.shouldAdvanceLiveState({ epoch: 1, sequence: 2 }, { epoch: 1, sequence: 1 }), true);
assert.equal(order.shouldAdvanceLiveState({ epoch: 2, sequence: 1 }, { epoch: 1, sequence: 999 }), true);
assert.equal(order.shouldAdvanceLiveState({ epoch: 1, sequence: 1 }, { epoch: 1, sequence: 1 }), false);
assert.equal(order.shouldAdvanceLiveState({ epoch: 1, sequence: 1 }, { epoch: 1, sequence: 2 }), false);
assert.equal(order.shouldAdvanceLiveState({ epoch: 1, sequence: 999 }, { epoch: 2, sequence: 1 }), false);
assert.equal(order.shouldAdvanceLiveState({ epoch: -1, sequence: 1 }, null), false);
assert.equal(order.shouldAdvanceLiveState({ epoch: 1, sequence: 0 }, null), false);
assert.equal(order.shouldAdvanceLiveState({ epoch: 1, sequence: Number.MAX_SAFE_INTEGER + 1 }, null), false);

console.log('PHASE5_LIVE_STATE_ORDER_PASS');
