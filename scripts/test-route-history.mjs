import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [storePath] = process.argv.slice(2);
if (!storePath) throw new Error('usage: test-route-history.mjs <history-store-module>');
const store = await import(pathToFileURL(storePath).href + `?v=${Date.now()}`);

const base = {
  version: 2, epoch: 7, sequence: 42, elapsedRealtimeMs: 500000, wallTimeMs: Date.UTC(2026,9,31,6,15,20),
  rawLatE7: 13002000, rawLonE7: 1038050000, rawAccuracyCm: 1200,
  trustedLatE7: 13002000, trustedLonE7: 1038050000, uncertaintyCm: 2500,
  speedCms: 140, speedAccuracyCms: 30, bearingCdeg: 9000, bearingAccuracyCdeg: 500,
  altitudeCm: null, verticalAccuracyCm: null, batteryPct: 73, charging: false,
  rawAccepted: false, rawMock: false, fallback: true,
  activity: 2, activityConfidence: 88, quality: 4, source: 2,
  gnssUsedInFix: 0, gnssTotal: 0, gnssAverageCn0Tenth: 0, stepDelta: 5
};
const rawPacket = structuredClone(base);
const trustedPacket = { ...structuredClone(base), trustedLatE7: 13000000, trustedLonE7: 1038050100, uncertaintyCm: 2800, source: 4 };

const objects = new Map();
const env = {
  HISTORY: {
    async get() { return null; },
    async put(key, body, options) { objects.set(key, { body, options }); }
  }
};
let acked = false, retried = false;
const message = { body: { type:'location', deviceId:'child-1', packet:trustedPacket, rawPacket }, ack(){acked=true;}, retry(){retried=true;} };
await store.processHistoryBatch({ messages:[message] }, env);
assert.equal(acked, true);
assert.equal(retried, false);

const rawEntry = [...objects.entries()].find(([key]) => key.startsWith('history/raw/'));
const trustedEntry = [...objects.entries()].find(([key]) => key.startsWith('history/trusted/'));
assert.ok(rawEntry, 'raw R2 segment missing');
assert.ok(trustedEntry, 'trusted R2 segment missing');

async function ungzip(body) {
  const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
const raw = await ungzip(rawEntry[1].body);
const trusted = await ungzip(trustedEntry[1].body);
assert.equal(raw.v, 4);
assert.equal(raw.packets[0].trustedLatE7, rawPacket.trustedLatE7, 'raw history must preserve Android estimate');
assert.equal(raw.packets[0].source, 2);
assert.equal(raw.trustedPackets[0].trustedLatE7, trustedPacket.trustedLatE7, 'server trusted packet missing from merge evidence');
assert.equal(raw.trustedPackets[0].source, 4);
assert.equal(trusted.v, 4);
assert.equal(trusted.delta.first[2], trustedPacket.trustedLatE7, 'trusted delta must use route-constrained coordinate');
assert.equal(trusted.delta.first[13], 4, 'trusted delta must label route-constrained source');
console.log('Phase 6 raw-vs-route-trusted R2 history preservation OK');
