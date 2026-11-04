import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
const b = await import(pathToFileURL(process.argv[2]).href);
const compressedMax = b.MAX_BACKUP_COMPRESSED_BYTES ?? 8 * 1024 * 1024;
const decodedMax = b.MAX_BACKUP_DECODED_BYTES ?? 16 * 1024 * 1024;
const array = x => x.buffer.slice(x.byteOffset, x.byteOffset + x.byteLength);
function snapshot(size) {
  const s = { format: 'brick-d1-snapshot-v3', createdAt: 1, excludes: [], tables: Object.fromEntries(b.BACKUP_TABLES.map(t => [t, []])), padding: '' };
  s.padding = 'x'.repeat(size - Buffer.byteLength(JSON.stringify(s)));
  assert.equal(Buffer.byteLength(JSON.stringify(s)), size);
  return array(gzipSync(JSON.stringify(s)));
}
let failures = 0;
async function check(label, fn) { try { await fn(); console.log('PASS P8D-053 ' + label); } catch(e) { failures++; console.error('FAIL P8D-053 ' + label + ': ' + e.message); } }
await check('compressed input rejected before decompression at max+1', async () => {
  await assert.rejects(b.validateBackupBody(new ArrayBuffer(compressedMax + 1)), /compressed.*limit/);
});
await check('high-ratio valid gzip rejected while decoding at max+1', async () => {
  await assert.rejects(b.validateBackupBody(snapshot(decodedMax + 1)), /decoded.*limit/);
});
await check('exact decoded byte boundary accepts a structurally valid snapshot', async () => {
  assert.equal((await b.validateBackupBody(snapshot(decodedMax))).format, 'brick-d1-snapshot-v3');
});
await check('oversized generated snapshot never publishes or deletes recovery objects', async () => {
  let puts = 0, lists = 0;
  const db = { prepare(sql) { return { sql, bind() { return this; } }; }, async batch(items) {
    return items.map(({sql}) => ({ results: sql.includes('FROM devices ') ? [{ id: 'synthetic', name: 'x'.repeat(decodedMax) }] : [] }));
  } };
  await assert.rejects(b.snapshotD1ToR2({ DB: db, HISTORY: {
    async put() { puts++; }, async list() { lists++; return { objects: [], truncated: false }; }, async delete() { throw Error('must not prune on failed snapshot'); }
  } }), /decoded.*limit/);
  assert.equal(puts, 0); assert.equal(lists, 0);
});
if (failures) process.exitCode = 1;
