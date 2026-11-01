import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('usage: test-phase5-fusion-protocol.mjs <protocol-module>');
const protocol = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

const MISSING = -2147483648;

function packet({ source = 6, quality = 4, flags = 0x40, trusted = true } = {}) {
  const buffer = new ArrayBuffer(90);
  const v = new DataView(buffer);
  let o = 0;
  v.setUint8(o++, 2);
  v.setUint32(o, 1, false); o += 4;
  v.setBigUint64(o, 7n, false); o += 8;
  v.setBigUint64(o, 123456n, false); o += 8;
  v.setBigUint64(o, 1800000000000n, false); o += 8;
  v.setInt32(o, MISSING, false); o += 4;
  v.setInt32(o, MISSING, false); o += 4;
  v.setInt32(o, MISSING, false); o += 4;
  v.setInt32(o, trusted ? 13_000_000 : MISSING, false); o += 4;
  v.setInt32(o, trusted ? 1_038_000_000 : MISSING, false); o += 4;
  v.setInt32(o, 8_000, false); o += 4;
  v.setInt32(o, MISSING, false); o += 4;
  v.setInt32(o, MISSING, false); o += 4;
  v.setInt32(o, MISSING, false); o += 4;
  v.setInt32(o, MISSING, false); o += 4;
  v.setInt32(o, MISSING, false); o += 4;
  v.setInt32(o, MISSING, false); o += 4;
  v.setUint8(o++, 72);
  v.setUint16(o, flags, false); o += 2;
  v.setUint8(o++, 1);
  v.setUint8(o++, 80);
  v.setUint8(o++, quality);
  v.setUint8(o++, source);
  v.setUint8(o++, 0);
  v.setUint8(o++, 0);
  v.setUint16(o, 0, false); o += 2;
  v.setUint16(o, 0, false); o += 2;
  assert.equal(o, 90);
  return buffer;
}

const decoded = protocol.decodeLivePacket(packet());
assert.equal(decoded.source, 6);
assert.equal(decoded.quality, 4);
assert.equal(decoded.fallback, true);
assert.equal(protocol.sourceName(6), 'fusion');
assert.equal(decoded.trustedLatE7, 13_000_000);
assert.equal(decoded.trustedLonE7, 1_038_000_000);

assert.throws(() => protocol.decodeLivePacket(packet({ source: 5 })), /bad source/,
  'server-only route_constrained source must never be accepted from Android');
assert.throws(() => protocol.decodeLivePacket(packet({ flags: 0x42 })), /invalid fusion packet/,
  'fusion must never claim raw GPS acceptance');
assert.throws(() => protocol.decodeLivePacket(packet({ quality: 2 })), /invalid fusion packet/,
  'fusion must never manufacture PRECISE or ASSISTED');
assert.throws(() => protocol.decodeLivePacket(packet({ trusted: false })), /invalid fusion packet/,
  'fusion without an actual constrained position must not be uploaded as a location point');

console.log('PHASE5_FUSION_PROTOCOL_PASS');
