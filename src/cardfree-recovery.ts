import { BACKUP_TABLES, TRANSIENT_RECOVERY_TABLES, MAX_BACKUP_DECODED_BYTES } from './backup-v6';
import { restoreBackupToFreshD1 } from './backup-restore-v6';
import { CHUNK_BYTES, MAX_OBJECT_BYTES } from './dev-free-runtime';

// Internal/off-platform recovery building block. No HTTP route, scheduled call or
// live configuration enables restore. The operator must independently quiesce
// BOTH D1 databases and all device DOs; D1 batch is atomic within one database only.
export const CARDFREE_PRIMARY_TABLES = [...BACKUP_TABLES, 'dev_location_history', 'dev_object_store', 'dev_object_chunks'] as const;
export const CARDFREE_PRIMARY_EXCLUDED = [...TRANSIENT_RECOVERY_TABLES, 'dev_parent_login_tokens', 'dev_parent_sessions', 'dev_parent_credentials', 'dev_maintenance_state'] as const;
export const CARDFREE_DIAGNOSTIC_TABLES = ['beta_latest', 'beta_runs', 'beta_records', 'beta_reviews'] as const;
export const CARDFREE_DIAGNOSTIC_EXCLUDED = ['beta_requests', 'beta_challenges'] as const;
const MAX_ROWS = 100_000;
export type Column = { name: string; type: string; notnull: number; pk: number; dflt_value: string | null };
export type Cell = string | number | null | { blobBase64: string };
export type Store = { columns: Record<string, Column[]>; tables: Record<string, Record<string, Cell>[]> };
export type Snapshot = { format: 'brick-cardfree-d1-v1'; createdAt: number; primary: Store; diagnostics: Store };
type Env = { DB: D1Database; BETA_DB: D1Database; BRICK_RECOVERY_MODE?: string };
const encoder = new TextEncoder();
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
async function digest(bytes: ArrayBuffer) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join(''); }
function encodeBlob(value: unknown): Cell {
  let bytes: Uint8Array;
  if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
  else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  else if (Array.isArray(value) && value.every(x => Number.isInteger(x) && x >= 0 && x <= 255)) bytes = Uint8Array.from(value);
  else throw Error('invalid recovery BLOB');
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { blobBase64: btoa(binary) };
}
function decodeCell(value: unknown, column: Column): string | number | null | ArrayBuffer {
  if (value === null) { if (column.notnull) throw Error('null recovery column'); return null; }
  if (column.type.toUpperCase() === 'BLOB') {
    if (!record(value) || Object.keys(value).join(',') !== 'blobBase64' || typeof value.blobBase64 !== 'string') throw Error('invalid recovery BLOB encoding');
    let binary: string; try { binary = atob(value.blobBase64); } catch { throw Error('invalid recovery BLOB encoding'); }
    if (btoa(binary) !== value.blobBase64) throw Error('noncanonical recovery BLOB encoding');
    return Uint8Array.from(binary, x => x.charCodeAt(0)).buffer;
  }
  const type = column.type.toUpperCase();
  if (type === 'TEXT' && typeof value === 'string') return value;
  if (type === 'INTEGER' && typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (type === 'REAL' && typeof value === 'number' && Number.isFinite(value)) return value;
  throw Error('invalid recovery cell');
}
// Exact SQLite-stored bodies from schema/008_v1_phase2_evidence.sql. Names alone
// are insufficient: replacing one with a mutating trigger must fail preflight.
// Any legitimate trigger migration needs an explicit policy/source review.
const APPROVED_RECOVERY_TRIGGERS:Record<string,{table:string;sql:string}>={
  "trg_evidence_batch_records_identity_insert": {
    "table": "evidence_batch_records",
    "sql": "CREATE TRIGGER trg_evidence_batch_records_identity_insert\nBEFORE INSERT ON evidence_batch_records\nFOR EACH ROW\nWHEN NOT EXISTS (\n  SELECT 1 FROM evidence_records r\n  WHERE r.device_id = NEW.device_id\n    AND r.record_id = NEW.record_id\n    AND r.epoch = NEW.epoch\n    AND r.sequence = NEW.sequence\n)\nBEGIN\n  SELECT RAISE(ABORT, 'evidence batch link identity mismatch');\nEND"
  },
  "trg_evidence_batch_records_identity_update": {
    "table": "evidence_batch_records",
    "sql": "CREATE TRIGGER trg_evidence_batch_records_identity_update\nBEFORE UPDATE OF device_id, record_id, epoch, sequence ON evidence_batch_records\nFOR EACH ROW\nWHEN NOT EXISTS (\n  SELECT 1 FROM evidence_records r\n  WHERE r.device_id = NEW.device_id\n    AND r.record_id = NEW.record_id\n    AND r.epoch = NEW.epoch\n    AND r.sequence = NEW.sequence\n)\nBEGIN\n  SELECT RAISE(ABORT, 'evidence batch link identity mismatch');\nEND"
  }
};
async function columns(db: D1Database, table: string): Promise<Column[]> {
  const result = await db.prepare('PRAGMA table_xinfo(' + table + ')').all<Column & {hidden:number}>();
  if (!result.results.length) throw Error('missing recovery table: ' + table);
  if(result.results.some(c=>c.hidden!==0))throw Error('unsupported hidden/generated recovery column: '+table);
  return result.results.map(({ name, type, notnull, pk, dflt_value }) => ({ name, type, notnull, pk, dflt_value }));
}
async function inventory(db: D1Database, durable: readonly string[], excluded: readonly string[]) {
  // One query preserves the bounded capture invocation's existing SQL envelope.
  const objects=(await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND (type IN ('view','trigger') OR type='table' AND name NOT IN ('_cf_METADATA','d1_migrations','brick_dev_migrations'))").all<{type:string;name:string;tbl_name:string;sql:string}>()).results;
  const expected=durable.includes('evidence_batch_records')?APPROVED_RECOVERY_TRIGGERS:{};
  const behavior=objects.filter(o=>o.type!=='table');
  if(behavior.length!==Object.keys(expected).length||behavior.some(o=>o.type!=='trigger'||!Object.hasOwn(expected,o.name)||o.tbl_name!==expected[o.name].table||o.sql!==expected[o.name].sql))throw Error('unclassified recovery schema trigger/view');
  const actual=objects.filter(o=>o.type==='table').map(o=>o.name).sort();
  const metadata = (await db.prepare('PRAGMA table_xinfo(brick_dev_migrations)').all<Column & {hidden:number}>()).results;
  if (metadata.length && (metadata.some(c=>c.hidden!==0) || metadata.length !== 2 || metadata[0].name !== 'name' || metadata[0].type !== 'TEXT' || metadata[0].pk !== 1 || metadata[1].name !== 'applied_at' || metadata[1].type !== 'INTEGER' || metadata[1].notnull !== 1)) throw Error('invalid migration bookkeeping schema');
  if (JSON.stringify(actual) !== JSON.stringify([...durable, ...excluded].sort())) throw Error('unclassified recovery schema');
}
async function capture(db: D1Database, durable: readonly string[], excluded: readonly string[]): Promise<Store> {
  await inventory(db, durable, excluded);
  const schema: Store['columns'] = {};
  for (const table of durable) schema[table] = await columns(db, table);
  // Exclude prior logical backup objects to prevent recursive backup growth.
  const where = (table: string) => ['dev_object_store', 'dev_object_chunks'].includes(table) ? " WHERE key NOT LIKE 'backups/d1/%'" : '';
  const pages = await db.batch<Record<string, unknown>>(durable.map(table => db.prepare('SELECT * FROM ' + table + where(table) + ' LIMIT ?1').bind(MAX_ROWS + 1)));
  if (pages.length !== durable.length) throw Error('incomplete recovery capture');
  const tables: Store['tables'] = {};
  for (let i = 0; i < durable.length; i++) {
    const table = durable[i], rows = pages[i]?.results;
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw Error('recovery row limit exceeded: ' + table);
    tables[table] = rows.map(row => Object.fromEntries(schema[table].map(c => [c.name, c.type.toUpperCase() === 'BLOB' && row[c.name] !== null ? encodeBlob(row[c.name]) : row[c.name] as Cell])));
  }
  return { columns: schema, tables };
}
export async function exportCardfreeD1(env: Env, quiesced: boolean, now = Date.now()) {
  if (quiesced !== true) throw Error('quiesced multi-store capture required');
  if (!Number.isSafeInteger(now) || now <= 0) throw Error('invalid recovery timestamp');
  const snapshot: Snapshot = { format: 'brick-cardfree-d1-v1', createdAt: now,
    primary: await capture(env.DB, CARDFREE_PRIMARY_TABLES, CARDFREE_PRIMARY_EXCLUDED),
    diagnostics: await capture(env.BETA_DB, CARDFREE_DIAGNOSTIC_TABLES, CARDFREE_DIAGNOSTIC_EXCLUDED) };
  return finalizeCardfreeCapture(snapshot);
}
export function encodeCardfreeCaptureRow(row:Record<string,unknown>,spec:Column[]){
 const names=spec.map(c=>c.name);if(JSON.stringify(Object.keys(row).sort())!==JSON.stringify([...names].sort()))throw Error('capture column mismatch');
 const result=Object.fromEntries(spec.map(c=>[c.name,c.type.toUpperCase()==='BLOB'&&row[c.name]!==null?encodeBlob(row[c.name]):row[c.name] as Cell]));
 for(const c of spec)decodeCell(result[c.name],c);return result;
}
export async function finalizeCardfreeCapture(value:unknown){
 if(!record(value)||Object.keys(value).sort().join(',')!=='createdAt,diagnostics,format,primary'||value.format!=='brick-cardfree-d1-v1'||!Number.isSafeInteger(value.createdAt)||(value.createdAt as number)<=0)throw Error('invalid capture envelope');
 const snapshot=value as unknown as Snapshot;
 for(const [store,names] of [[snapshot.primary,CARDFREE_PRIMARY_TABLES],[snapshot.diagnostics,CARDFREE_DIAGNOSTIC_TABLES]] as const){
  if(!record(store)||Object.keys(store).sort().join(',')!=='columns,tables'||!record(store.columns)||!record(store.tables))throw Error('invalid capture store');
  for(const obj of [store.columns,store.tables])if(JSON.stringify(Object.keys(obj).sort())!==JSON.stringify([...names].sort()))throw Error('capture inventory mismatch');
  for(const table of names){const spec=store.columns[table],rows=store.tables[table];
   if(!Array.isArray(spec)||!spec.length||!Array.isArray(rows)||rows.length>MAX_ROWS||new Set(spec.map(c=>c.name)).size!==spec.length)throw Error('invalid capture table');
   for(const c of spec)if(!record(c)||Object.keys(c).sort().join(',')!=='dflt_value,name,notnull,pk,type'||typeof c.name!=='string'||!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(c.name)||!['TEXT','INTEGER','REAL','BLOB'].includes(c.type?.toUpperCase())||![0,1].includes(c.notnull)||!Number.isSafeInteger(c.pk)||c.pk<0||!(c.dflt_value===null||typeof c.dflt_value==='string'))throw Error('invalid capture columns');
   for(const row of rows){if(!record(row)||JSON.stringify(Object.keys(row).sort())!==JSON.stringify(spec.map(c=>c.name).sort()))throw Error('capture column mismatch');for(const c of spec)decodeCell(row[c.name],c);}
  }
 }
 const bytes=encoder.encode(JSON.stringify(snapshot));if(bytes.byteLength>MAX_BACKUP_DECODED_BYTES)throw Error('cardfree recovery byte limit exceeded');
 await verifyObjects(snapshot.primary);return{body:bytes.buffer,sha256:await digest(bytes.buffer),createdAt:snapshot.createdAt};
}
export {inventory as inspectCardfreeInventory,columns as cardfreeCaptureColumns};

async function preflight(db: D1Database, value: unknown, durable: readonly string[], excluded: readonly string[]) {
  await inventory(db, durable, excluded);
  if (!record(value) || Object.keys(value).sort().join(',') !== 'columns,tables' || !record(value.tables) || !record(value.columns)) throw Error('invalid recovery store');
  for (const obj of [value.tables, value.columns]) if (JSON.stringify(Object.keys(obj).sort()) !== JSON.stringify([...durable].sort())) throw Error('recovery table inventory mismatch');
  const statements: D1PreparedStatement[] = [];
  for (const table of durable) {
    const spec = await columns(db, table);
    if (JSON.stringify(value.columns[table]) !== JSON.stringify(spec)) throw Error('recovery schema mismatch: ' + table);
    const rows = value.tables[table];
    if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw Error('invalid recovery rows');
    for (const row of rows) {
      if (!record(row) || JSON.stringify(Object.keys(row).sort()) !== JSON.stringify(spec.map(c => c.name).sort())) throw Error('recovery column mismatch: ' + table);
      const values = spec.map(c => decodeCell(row[c.name], c));
      statements.push(db.prepare('INSERT INTO ' + table + '(' + spec.map(c => '"' + c.name + '"').join(',') + ') VALUES (' + spec.map(() => '?').join(',') + ')').bind(...values));
    }
  }
  for (const table of [...durable, ...excluded]) if (Number((await db.prepare('SELECT COUNT(*) n FROM ' + table).first<{ n: number }>())?.n) !== 0) throw Error('recovery target is not empty: ' + table);
  return statements;
}
async function verifyObjects(store: Store) {
  const metas = store.tables.dev_object_store, chunks = store.tables.dev_object_chunks;
  const keys = new Set<string>();
  for (const meta of metas) {
    if (typeof meta.key !== 'string' || keys.has(meta.key) || typeof meta.size !== 'number' || !Number.isSafeInteger(meta.size) || meta.size < 0 || meta.size > MAX_OBJECT_BYTES || typeof meta.etag !== 'string' || !/^[a-f0-9]{64}$/.test(meta.etag)) throw Error('invalid recovery object metadata');
    keys.add(meta.key);
    const parts = chunks.filter(c => c.key === meta.key).sort((a, b) => Number(a.chunk_index) - Number(b.chunk_index));
    if (parts.length !== Math.ceil(meta.size / CHUNK_BYTES)) throw Error('incomplete recovery object');
    const bytes = new Uint8Array(meta.size);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.chunk_index !== i) throw Error('invalid recovery chunk index');
      const decoded = decodeCell(part.body, { name: 'body', type: 'BLOB', notnull: 1, pk: 0, dflt_value: null }) as ArrayBuffer;
      if (decoded.byteLength !== Math.min(CHUNK_BYTES, meta.size - i * CHUNK_BYTES)) throw Error('invalid recovery chunk size');
      bytes.set(new Uint8Array(decoded), i * CHUNK_BYTES);
    }
    if (await digest(bytes.buffer) !== meta.etag) throw Error('recovery object hash mismatch');
  }
  if (chunks.some(c => typeof c.key !== 'string' || !keys.has(c.key))) throw Error('orphan recovery object chunk');
}
export async function restoreCardfreeD1(env: Env, body: ArrayBuffer, sha256: string) {
  if (env.BRICK_RECOVERY_MODE !== 'isolated-restore') throw Error('cardfree restore disabled');
  if (!body.byteLength || body.byteLength > MAX_BACKUP_DECODED_BYTES || !/^[a-f0-9]{64}$/.test(sha256) || await digest(body) !== sha256) throw Error('cardfree recovery integrity mismatch');
  const raw: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  if (!record(raw) || Object.keys(raw).sort().join(',') !== 'createdAt,diagnostics,format,primary' || raw.format !== 'brick-cardfree-d1-v1' || !Number.isSafeInteger(raw.createdAt) || (raw.createdAt as number) <= 0) throw Error('invalid cardfree recovery envelope');
  // Validate BOTH stores, including every extra row/column/BLOB, before the first write.
  await preflight(env.DB, raw.primary, CARDFREE_PRIMARY_TABLES, CARDFREE_PRIMARY_EXCLUDED);
  const diagnosticStatements = await preflight(env.BETA_DB, raw.diagnostics, CARDFREE_DIAGNOSTIC_TABLES, CARDFREE_DIAGNOSTIC_EXCLUDED);
  const snapshot = raw as unknown as Snapshot;
  await verifyObjects(snapshot.primary);
  const legacy = { format: 'brick-d1-snapshot-v3', createdAt: snapshot.createdAt, excludes: [], tables: Object.fromEntries(BACKUP_TABLES.map(table => [table, snapshot.primary.tables[table]])) };
  const compressed = await new Response(new Blob([JSON.stringify(legacy)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  const base = await restoreBackupToFreshD1({ DB: env.DB }, compressed);
  // Restore adapter state in FK dependency order. Preserve original uploaded_at,
  // raw/trusted packet times, metadata and bytes instead of republishing objects.
  const extra = ['dev_location_history', 'dev_object_store', 'dev_object_chunks'];
  const extraOnly: Store = { columns: Object.fromEntries(extra.map(t => [t, snapshot.primary.columns[t]])), tables: Object.fromEntries(extra.map(t => [t, snapshot.primary.tables[t]])) };
  const inserts: D1PreparedStatement[] = [];
  for (const table of extra) for (const row of extraOnly.tables[table]) {
    const spec = extraOnly.columns[table];
    inserts.push(env.DB.prepare('INSERT INTO ' + table + '(' + spec.map(c => '"' + c.name + '"').join(',') + ') VALUES (' + spec.map(() => '?').join(',') + ')').bind(...spec.map(c => decodeCell(row[c.name], c))));
  }
  for (const [db, statements] of [[env.DB, inserts], [env.BETA_DB, diagnosticStatements]] as const) for (let i = 0; i < statements.length; i += 50) await db.batch(statements.slice(i, i + 50));
  for (const [db, store, tables, excluded] of [[env.DB, snapshot.primary, CARDFREE_PRIMARY_TABLES, CARDFREE_PRIMARY_EXCLUDED], [env.BETA_DB, snapshot.diagnostics, CARDFREE_DIAGNOSTIC_TABLES, CARDFREE_DIAGNOSTIC_EXCLUDED]] as const) {
    for (const table of tables) if (Number((await db.prepare('SELECT COUNT(*) n FROM ' + table).first<{ n: number }>())?.n) !== store.tables[table].length) throw Error('recovery row reconciliation failed: ' + table);
    for(const table of excluded)if(Number((await db.prepare('SELECT COUNT(*) n FROM '+table).first<{n:number}>())?.n)!==0)throw Error('recovery excluded-state reconciliation failed: '+table);
    if ((await db.prepare('PRAGMA foreign_key_check').all()).results.length) throw Error('recovery foreign-key reconciliation failed');
  }
  // A failed batch can leave a partial isolated target. Discard it and retry fresh;
  // this function does not promise a cross-database transaction or resumable repair.
  return { format: snapshot.format, primaryTables: CARDFREE_PRIMARY_TABLES.length, diagnosticTables: CARDFREE_DIAGNOSTIC_TABLES.length, legacy: base, doRecovery: 'SEPARATE_REQUIRED', scheduler: 'RECONSTRUCT_REQUIRED' };
}
