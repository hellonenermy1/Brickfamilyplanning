import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('usage: test-phase4-provider-contract.mjs <evidence-protocol-module>');
const protocol = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

const PROVIDERS = [
  { provider: 11, family: 7, group: 'wifi.scan', payload: '{"v":1,"aps":[]}' },
  { provider: 12, family: 8, group: 'ble.scan', payload: '{"v":1,"dev":[]}' },
  { provider: 9, family: 6, group: 'cell.env', payload: '{"v":1,"cells":[]}' },
  { provider: 13, family: 5, group: 'lan.nsd', payload: '{"v":1,"services":[]}' },
  { provider: 1, family: 1, group: 'gnss.sky', payload: '{"v":1,"const":[]}' },
  { provider: 8, family: 5, group: 'network.ctx', payload: '{"v":1,"t":"wifi"}' }
];

function uuidBytes(seed) {
  const out = new Uint8Array(16);
  for (let i = 0; i < out.length; i++) out[i] = (seed * 31 + i * 17) & 0xff;
  out[6] = (out[6] & 0x0f) | 0x40;
  out[8] = (out[8] & 0x3f) | 0x80;
  return out;
}

function encode(providerRows = PROVIDERS) {
  const encoder = new TextEncoder();
  const rows = providerRows.map((row, index) => ({
    ...row,
    id: uuidBytes(index + 2),
    groupBytes: encoder.encode(row.group),
    payloadBytes: encoder.encode(row.payload),
    sequence: index + 1
  }));
  const size = 23 + rows.reduce((n, row) => n + 52 + row.groupBytes.length + row.payloadBytes.length, 0);
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  let o = 0;
  view.setUint32(o, 0x42524556, false); o += 4;
  view.setUint8(o++, 1);
  new Uint8Array(buffer, o, 16).set(uuidBytes(1)); o += 16;
  view.setUint16(o, rows.length, false); o += 2;
  for (const row of rows) {
    new Uint8Array(buffer, o, 16).set(row.id); o += 16;
    view.setUint32(o, 7, false); o += 4;
    view.setBigUint64(o, BigInt(row.sequence), false); o += 8;
    view.setBigUint64(o, BigInt(1000 + row.sequence), false); o += 8;
    view.setBigUint64(o, BigInt(1_800_000_000_000 + row.sequence), false); o += 8;
    view.setUint8(o++, row.provider);
    view.setUint8(o++, row.family);
    view.setUint8(o++, 0); // SUPPORTED
    view.setUint8(o++, 0); // HEALTHY
    view.setUint8(o++, 2); // MEDIUM
    view.setUint8(o++, row.groupBytes.length);
    view.setUint16(o, row.payloadBytes.length, false); o += 2;
    new Uint8Array(buffer, o, row.groupBytes.length).set(row.groupBytes); o += row.groupBytes.length;
    new Uint8Array(buffer, o, row.payloadBytes.length).set(row.payloadBytes); o += row.payloadBytes.length;
  }
  assert.equal(o, size);
  return buffer;
}

const decoded = protocol.decodeEvidenceBatch(encode());
assert.equal(decoded.records.length, PROVIDERS.length);
for (let i = 0; i < PROVIDERS.length; i++) {
  assert.equal(decoded.records[i].provider, PROVIDERS[i].provider);
  assert.equal(decoded.records[i].family, PROVIDERS[i].family);
  assert.equal(decoded.records[i].independenceGroup, PROVIDERS[i].group);
  assert.equal(new TextDecoder().decode(decoded.records[i].payload), PROVIDERS[i].payload);
}
assert.equal(new Set(decoded.records.map(r => r.independenceGroup)).size, 6, 'independent Atlas families must remain distinct on wire');

const badProvider = PROVIDERS.map((row, i) => i === 0 ? { ...row, provider: 22 } : row);
assert.throws(() => protocol.decodeEvidenceBatch(encode(badProvider)), /unknown evidence provider/);
const badFamily = PROVIDERS.map((row, i) => i === 0 ? { ...row, family: 14 } : row);
assert.throws(() => protocol.decodeEvidenceBatch(encode(badFamily)), /unknown evidence family/);

console.log('PHASE4_PROVIDER_WIRE_CONTRACT_PASS');
