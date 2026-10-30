import type { BrickDevice } from "./device-do";
import { evaluateSafety } from "./phase4";
import { trustedPoint, type HistoryPoint } from "./history-codec";
import type { LivePacket } from "./protocol";

const DAY_MS = 86_400_000;
const RAW_DAYS = 30;
const TRUSTED_DAYS = 90;
const SEEN_BLOCK_SIZE = 20;
const TRIP_IDLE_CHECKPOINT_MS = 60_000;
const MAP_KEY = "basemap/singapore.pmtiles";
const META_KEY = "basemap/singapore.meta.json";
const MISSING = -2147483648;
const TRUSTED_RECORD_BYTES = 52;
const RAW_RECORD_BYTES = 90;

function bytesFromD1(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value.map(Number));
  throw new Error("invalid D1 BLOB value");
}
function arrayBufferOf(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
function streamOf(bytes: Uint8Array) { return new Blob([arrayBufferOf(bytes)]).stream(); }
function fakeObject(
  key: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
  contentEncoding?: string,
  sizeOverride?: number,
  range?: { offset: number; length: number }
) {
  const totalSize = sizeOverride ?? bytes.byteLength;
  const etag = `\"d1-${totalSize}-${key.length}\"`;
  return {
    key, version: "d1", size: totalSize, etag, httpEtag: etag, uploaded: new Date(),
    httpMetadata: { contentType, contentEncoding }, customMetadata: {}, range,
    body: streamOf(bytes), bodyUsed: false, checksums: {}, storageClass: "Standard",
    writeHttpMetadata(headers: Headers) {
      headers.set("Content-Type", contentType);
      if (contentEncoding) headers.set("Content-Encoding", contentEncoding);
    },
    async arrayBuffer() { return arrayBufferOf(bytes); },
    async text() { return new TextDecoder().decode(bytes); },
    async json<T>() { return JSON.parse(new TextDecoder().decode(bytes)) as T; },
    async blob() { return new Blob([arrayBufferOf(bytes)], { type: contentType }); }
  };
}
function putNullableInt(v: DataView, o: number, value: number | null) { v.setInt32(o, value === null ? MISSING : value, false); }
function encodeRawPacket(p: LivePacket) {
  const b = new ArrayBuffer(RAW_RECORD_BYTES), v = new DataView(b); let o = 0;
  v.setUint8(o++, 2); v.setUint32(o, p.epoch, false); o += 4; v.setBigUint64(o, BigInt(p.sequence), false); o += 8;
  v.setBigUint64(o, BigInt(Math.trunc(p.elapsedRealtimeMs)), false); o += 8; v.setBigUint64(o, BigInt(Math.trunc(p.wallTimeMs)), false); o += 8;
  for (const x of [p.rawLatE7, p.rawLonE7, p.rawAccuracyCm, p.trustedLatE7, p.trustedLonE7]) { putNullableInt(v, o, x); o += 4; }
  v.setInt32(o, p.uncertaintyCm, false); o += 4;
  for (const x of [p.speedCms, p.speedAccuracyCms, p.bearingCdeg, p.bearingAccuracyCdeg, p.altitudeCm, p.verticalAccuracyCm]) { putNullableInt(v, o, x); o += 4; }
  v.setUint8(o++, p.batteryPct); let flags = 0;
  if (p.charging) flags |= 1; if (p.rawAccepted) flags |= 2; if (p.rawMock) flags |= 4; if (p.fallback) flags |= 0x40;
  v.setUint16(o, flags, false); o += 2; v.setUint8(o++, p.activity); v.setUint8(o++, p.activityConfidence); v.setUint8(o++, p.quality); v.setUint8(o++, p.source);
  v.setUint8(o++, p.gnssUsedInFix); v.setUint8(o++, p.gnssTotal); v.setUint16(o, p.gnssAverageCn0Tenth, false); o += 2; v.setUint16(o, p.stepDelta, false);
  return new Uint8Array(b);
}
function encodeTrustedRecord(p: LivePacket) {
  const t = trustedPoint(p), b = new ArrayBuffer(TRUSTED_RECORD_BYTES), v = new DataView(b);
  v.setUint32(0, t.epoch, false); v.setBigUint64(4, BigInt(t.sequence), false); v.setFloat64(12, t.wallTimeMs, false);
  v.setInt32(20, t.trustedLatE7 ?? MISSING, false); v.setInt32(24, t.trustedLonE7 ?? MISSING, false); v.setUint32(28, t.uncertaintyCm, false);
  v.setInt32(32, t.speedCms ?? MISSING, false); v.setInt32(36, t.speedAccuracyCms ?? MISSING, false); v.setInt32(40, t.bearingCdeg ?? MISSING, false);
  v.setUint8(44, t.batteryPct); let f = 0; if (t.charging) f |= 1; if (t.fallback) f |= 2; if (t.rawAccepted) f |= 4;
  v.setUint8(45, f); v.setUint8(46, t.activity); v.setUint8(47, t.activityConfidence); v.setUint8(48, t.quality); v.setUint8(49, t.source);
  return new Uint8Array(b);
}
function nullable(v: number) { return v === MISSING ? null : v; }
function decodeTrustedBlob(value: unknown): HistoryPoint[] {
  const bytes = bytesFromD1(value);
  if (bytes.byteLength % TRUSTED_RECORD_BYTES !== 0) throw new Error("corrupt trusted history blob");
  const out: HistoryPoint[] = [];
  for (let o = 0; o < bytes.byteLength; o += TRUSTED_RECORD_BYTES) {
    const v = new DataView(bytes.buffer, bytes.byteOffset + o, TRUSTED_RECORD_BYTES), flags = v.getUint8(45);
    out.push({
      epoch: v.getUint32(0, false), sequence: Number(v.getBigUint64(4, false)), wallTimeMs: v.getFloat64(12, false),
      trustedLatE7: nullable(v.getInt32(20, false)), trustedLonE7: nullable(v.getInt32(24, false)), uncertaintyCm: v.getUint32(28, false),
      speedCms: nullable(v.getInt32(32, false)), speedAccuracyCms: nullable(v.getInt32(36, false)), bearingCdeg: nullable(v.getInt32(40, false)),
      batteryPct: v.getUint8(44), charging: (flags & 1) !== 0, fallback: (flags & 2) !== 0, rawAccepted: (flags & 4) !== 0,
      activity: v.getUint8(46), activityConfidence: v.getUint8(47), quality: v.getUint8(48), source: v.getUint8(49)
    });
  }
  return out;
}

async function archiveHour(db: D1Database, deviceId: string, p: LivePacket) {
  const now = Date.now();
  if (p.wallTimeMs < now - TRUSTED_DAYS * DAY_MS) return;
  const hour = Math.floor(p.wallTimeMs / 3_600_000) * 3_600_000;
  const rawExpires = hour + RAW_DAYS * DAY_MS, trustedExpires = hour + TRUSTED_DAYS * DAY_MS;
  const raw = p.wallTimeMs < now - RAW_DAYS * DAY_MS ? null : encodeRawPacket(p), trusted = encodeTrustedRecord(p);
  await db.prepare("INSERT INTO history_hours(device_id,hour_start,raw_blob,trusted_blob,point_count,raw_expires_at,trusted_expires_at,updated_at) VALUES(?1,?2,?3,?4,1,?5,?6,?7) ON CONFLICT(device_id,hour_start) DO UPDATE SET raw_blob=CASE WHEN excluded.raw_blob IS NULL THEN history_hours.raw_blob ELSE CAST(COALESCE(history_hours.raw_blob,X'') || excluded.raw_blob AS BLOB) END,trusted_blob=CAST(history_hours.trusted_blob || excluded.trusted_blob AS BLOB),point_count=history_hours.point_count+1,updated_at=excluded.updated_at")
    .bind(deviceId, hour, raw === null ? null : arrayBufferOf(raw), arrayBufferOf(trusted), rawExpires, trustedExpires, now).run();
}

type VirtualKind = "seen" | "advance" | "reliability" | "retention";
class VirtualStatement {
  constructor(readonly owner: D1FreeDatabase, readonly kind: VirtualKind, readonly args: unknown[] = []) {}
  bind(...values: unknown[]) { return new VirtualStatement(this.owner, this.kind, values) as unknown as D1PreparedStatement; }
  run() { return this.owner.runVirtual(this); }
  all<T = Record<string, unknown>>() { return this.owner.allVirtual<T>(this); }
  async first<T = Record<string, unknown>>(column?: string) {
    const r = await this.owner.allVirtual<T>(this), row = r.results[0] ?? null;
    if (row === null || !column) return row as T | null;
    return (row as Record<string, unknown>)[column] as T | null;
  }
  async raw<T = unknown[]>() { const r = await this.owner.allVirtual<Record<string, unknown>>(this); return r.results.map(row => Object.values(row)) as T[]; }
}
function normalizeSql(sql: string) { return sql.replace(/\s+/g, " ").trim().toLowerCase(); }
function numberArg(value: unknown, name: string) { const n = Number(value); if (!Number.isSafeInteger(n) || n < 0) throw new Error(`invalid ${name}`); return n; }
function stringArg(value: unknown, name: string) { if (typeof value !== "string" || !value) throw new Error(`invalid ${name}`); return value; }
function compactLocationStatement(db: D1Database, id: string, epoch: number, sequence: number, now: number) {
  const block = Math.floor(sequence / SEEN_BLOCK_SIZE), offset = sequence % SEEN_BLOCK_SIZE, bit = 2 ** offset;
  return db.prepare("INSERT INTO location_seen_blocks(device_id,epoch,block_index,mask,received_count,min_offset,max_offset,first_seen_at,last_seen_at) VALUES(?1,?2,?3,?4,1,?5,?5,?6,?6) ON CONFLICT(device_id,epoch,block_index) DO UPDATE SET mask=(location_seen_blocks.mask | excluded.mask),received_count=location_seen_blocks.received_count+1,min_offset=MIN(location_seen_blocks.min_offset,excluded.min_offset),max_offset=MAX(location_seen_blocks.max_offset,excluded.max_offset),last_seen_at=excluded.last_seen_at WHERE (location_seen_blocks.mask & excluded.mask)=0")
    .bind(id, epoch, block, bit, offset, now);
}

class D1FreeDatabase {
  constructor(private readonly db: D1Database) {}
  prepare(query: string): D1PreparedStatement {
    const n = normalizeSql(query);
    if (n.startsWith("insert or ignore into device_events(device_id,epoch,sequence,kind,created_at) values")) return new VirtualStatement(this, "seen") as unknown as D1PreparedStatement;
    if (n.startsWith("update devices set last_epoch=")) return new VirtualStatement(this, "advance") as unknown as D1PreparedStatement;
    if (n.startsWith("select epoch,min(sequence) as min_seq,max(sequence) as max_seq,count(*) as received from device_events")) return new VirtualStatement(this, "reliability") as unknown as D1PreparedStatement;
    if (n.startsWith("delete from device_events where created_at <")) return new VirtualStatement(this, "retention") as unknown as D1PreparedStatement;
    if (n.startsWith("update devices set last_health_at=?1,")) return this.db.prepare(query.replace("UPDATE devices SET last_health_at=?1,", "UPDATE devices SET last_seen_at=?1,last_health_at=?1,"));

    // On the no-card backend, a stable geofence needs no row rewrite on every GPS packet.
    // Pending candidates still clear immediately, and non-newest packets are filtered by D1InlineEventQueue.
    if (n.startsWith("update geofence_state set candidate_state=null,candidate_since=null,candidate_count=0,last_distance_m=")) {
      return this.db.prepare("UPDATE geofence_state SET candidate_state=NULL,candidate_since=NULL,candidate_count=0,last_distance_m=?1,updated_at=?2,last_epoch=?3,last_sequence=?4 WHERE geofence_id=?5 AND (candidate_state IS NOT NULL OR candidate_count<>0)");
    }

    // Trip state is durable immediately when something meaningful changes; otherwise one checkpoint/minute is enough.
    if (n.startsWith("update trips set state=?1,ended_at=coalesce(?2,ended_at),arrival_candidate_since=")) {
      return this.db.prepare(
        "UPDATE trips SET state=?1,ended_at=COALESCE(?2,ended_at),arrival_candidate_since=?3,arrival_candidate_count=?4,last_alert_at=?5,stationary_since=?6,last_stop_alert_at=?7,last_eval_epoch=?8,last_eval_sequence=?9,last_distance_to_destination_m=?10,last_location_at=?11 " +
        "WHERE id=?12 AND state='active' AND (state<>?1 OR COALESCE(ended_at,-1)<>COALESCE(?2,-1) OR COALESCE(arrival_candidate_since,-1)<>COALESCE(?3,-1) OR arrival_candidate_count<>?4 OR COALESCE(last_alert_at,-1)<>COALESCE(?5,-1) OR COALESCE(stationary_since,-1)<>COALESCE(?6,-1) OR COALESCE(last_stop_alert_at,-1)<>COALESCE(?7,-1) OR last_location_at IS NULL OR ?11-last_location_at>=60000)"
      ) as D1PreparedStatement;
    }
    return this.db.prepare(query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    if (statements.length === 2 && statements[0] instanceof VirtualStatement && statements[1] instanceof VirtualStatement && statements[0].kind === "seen" && statements[1].kind === "advance") {
      const seen = statements[0], advance = statements[1];
      const id = stringArg(seen.args[0], "device id"), epoch = numberArg(seen.args[1], "epoch"), sequence = numberArg(seen.args[2], "sequence"), now = numberArg(seen.args[3], "received time");
      if (stringArg(advance.args[3], "advance device id") !== id || numberArg(advance.args[0], "advance epoch") !== epoch || numberArg(advance.args[1], "advance sequence") !== sequence) throw new Error("location batch mismatch");
      const [seenResult, maxResult] = await this.db.batch([
        compactLocationStatement(this.db, id, epoch, sequence, now),
        this.db.prepare("SELECT epoch,block_index,max_offset FROM location_seen_blocks WHERE device_id=?1 ORDER BY epoch DESC,block_index DESC LIMIT 1").bind(id)
      ]);
      const isNew = (seenResult.meta.changes ?? 0) > 0;
      const row = (maxResult.results?.[0] ?? null) as { epoch?: number; block_index?: number; max_offset?: number } | null;
      const maxSequence = row && typeof row.block_index === "number" && typeof row.max_offset === "number" ? row.block_index * SEEN_BLOCK_SIZE + row.max_offset : -1;
      const isNewest = isNew && row?.epoch === epoch && maxSequence === sequence;

      // Keep the devices table useful for operations without spending one D1 write for every location.
      if (isNewest && (sequence <= 1 || sequence % SEEN_BLOCK_SIZE === 0)) {
        await this.db.prepare("UPDATE devices SET last_epoch=?1,last_sequence=?2,last_seen_at=?3 WHERE id=?4 AND revoked_at IS NULL").bind(epoch, sequence, now, id).run();
      }
      const advanceResult = { ...maxResult, meta: { ...maxResult.meta, changes: isNewest ? 1 : 0 } } as D1Result<T>;
      return [seenResult as D1Result<T>, advanceResult];
    }
    if (statements.some(s => s instanceof VirtualStatement)) {
      const out: D1Result<T>[] = [];
      for (const statement of statements) {
        if (statement instanceof VirtualStatement) out.push(await this.runVirtual(statement) as D1Result<T>);
        else out.push(await statement.run<T>());
      }
      return out;
    }
    return this.db.batch<T>(statements);
  }

  async runVirtual(statement: VirtualStatement): Promise<D1Result<unknown>> {
    if (statement.kind === "seen") {
      const id = stringArg(statement.args[0], "device id"), epoch = numberArg(statement.args[1], "epoch"), sequence = numberArg(statement.args[2], "sequence"), now = numberArg(statement.args[3], "received time");
      return compactLocationStatement(this.db, id, epoch, sequence, now).run();
    }
    if (statement.kind === "advance") {
      const epoch = numberArg(statement.args[0], "epoch"), sequence = numberArg(statement.args[1], "sequence"), id = stringArg(statement.args[3], "device id");
      const r = await this.db.prepare("SELECT epoch,block_index,max_offset FROM location_seen_blocks WHERE device_id=?1 ORDER BY epoch DESC,block_index DESC LIMIT 1").bind(id).all<{ epoch: number; block_index: number; max_offset: number }>();
      const row = r.results[0], isNewest = !!row && row.epoch === epoch && row.block_index * SEEN_BLOCK_SIZE + row.max_offset === sequence;
      return { ...r, meta: { ...r.meta, changes: isNewest ? 1 : 0 } };
    }
    if (statement.kind === "retention") {
      const cutoff = numberArg(statement.args[0], "retention cutoff");
      return this.db.prepare("DELETE FROM location_seen_blocks WHERE last_seen_at<?1").bind(cutoff).run();
    }
    throw new Error(`virtual ${statement.kind} does not support run()`);
  }

  async allVirtual<T>(statement: VirtualStatement): Promise<D1Result<T>> {
    if (statement.kind !== "reliability") throw new Error(`virtual ${statement.kind} does not support all()`);
    const id = stringArg(statement.args[0], "device id"), start = numberArg(statement.args[1], "reliability start"), end = numberArg(statement.args[2], "reliability end");
    return this.db.prepare("SELECT epoch,MIN(block_index*?4+min_offset) AS min_seq,MAX(block_index*?4+max_offset) AS max_seq,SUM(received_count) AS received FROM location_seen_blocks WHERE device_id=?1 AND first_seen_at>=?2 AND last_seen_at<=?3 GROUP BY epoch").bind(id, start, end, SEEN_BLOCK_SIZE).all<T>();
  }
}

async function compactLatest(db: D1Database, deviceId: string) {
  return db.prepare("SELECT epoch,block_index,max_offset FROM location_seen_blocks WHERE device_id=?1 ORDER BY epoch DESC,block_index DESC LIMIT 1").bind(deviceId).first<{ epoch: number; block_index: number; max_offset: number }>();
}
function isPacketLatest(packet: LivePacket, row: { epoch: number; block_index: number; max_offset: number } | null) {
  if (!row) return false;
  return row.epoch === packet.epoch && row.block_index * SEEN_BLOCK_SIZE + row.max_offset === packet.sequence;
}

export class D1InlineEventQueue {
  constructor(private readonly env: { DB: D1Database; BRICK_DEVICE: DurableObjectNamespace<BrickDevice> }) {}
  async send(message: unknown) {
    const m = message as { type?: string; deviceId?: string; packet?: LivePacket };
    if (m.type !== "location" || !m.deviceId || !m.packet) return;
    await archiveHour(this.env.DB, m.deviceId, m.packet);

    // History accepts every unique packet. Safety state only follows the current newest packet so delayed backlog cannot rewind geofences/trips.
    const latest = await compactLatest(this.env.DB, m.deviceId);
    if (!isPacketLatest(m.packet, latest)) return;

    const events = await evaluateSafety(this.env as never, m.deviceId, m.packet);
    if (events.length) {
      const stub = this.env.BRICK_DEVICE.get(this.env.BRICK_DEVICE.idFromName(m.deviceId));
      for (const event of events) await stub.pushSafetyEvent(event);
    }
  }
  async sendBatch(messages: { body: unknown }[]) { for (const m of messages) await this.send(m.body); }
}

export class D1HistoryBucket {
  constructor(private readonly db: D1Database) {}
  async put() { throw new Error("D1 hourly history is written through EVENTS.send, not R2 put"); }
  async list(options: { prefix?: string; cursor?: string; limit?: number } = {}) {
    const prefix = options.prefix ?? "", match = /^history\/trusted\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/$/.exec(prefix);
    if (!match) return { objects: [], truncated: false, cursor: undefined, delimitedPrefixes: [] };
    const deviceId = match[1], start = Date.parse(`${match[2]}T00:00:00Z`), end = start + DAY_MS, after = Number(options.cursor || start - 1), limit = Math.max(1, Math.min(1000, options.limit ?? 1000));
    const rows = await this.db.prepare("SELECT hour_start,length(trusted_blob) AS bytes,updated_at FROM history_hours WHERE device_id=?1 AND hour_start>=?2 AND hour_start<?3 AND hour_start>?4 AND trusted_expires_at>?5 ORDER BY hour_start LIMIT ?6")
      .bind(deviceId, start, end, after, Date.now(), limit + 1).all<{ hour_start: number; bytes: number; updated_at: number }>();
    const selected = rows.results.slice(0, limit), truncated = rows.results.length > limit;
    return { objects: selected.map(r => ({ key: `history/trusted/${deviceId}/${match[2]}/${r.hour_start}.json`, size: r.bytes, uploaded: new Date(r.updated_at) })), truncated, cursor: truncated && selected.length ? String(selected[selected.length - 1].hour_start) : undefined, delimitedPrefixes: [] };
  }
  async get(key: string) {
    const m = /^history\/trusted\/([^/]+)\/\d{4}-\d{2}-\d{2}\/(\d+)\.json$/.exec(key);
    if (!m) return null;
    const row = await this.db.prepare("SELECT trusted_blob,updated_at FROM history_hours WHERE device_id=?1 AND hour_start=?2 AND trusted_expires_at>?3").bind(m[1], Number(m[2]), Date.now()).first<{ trusted_blob: unknown; updated_at: number }>();
    if (!row) return null;
    const bytes = new TextEncoder().encode(JSON.stringify({ points: decodeTrustedBlob(row.trusted_blob) })), obj = fakeObject(key, bytes, "application/json");
    obj.uploaded = new Date(row.updated_at); return obj;
  }
}

type MapManifest = { total_bytes: number; chunk_bytes: number; chunk_count: number; sha256_hex: string; metadata_json: string | null; installed_at: number };
function parseByteRange(value: string | null, total: number) {
  if (!value) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!m || (!m[1] && !m[2])) throw new Error("invalid range");
  let start: number, end: number;
  if (!m[1]) { const suffix = Math.max(1, Number(m[2])); start = Math.max(0, total - suffix); end = total - 1; }
  else { start = Number(m[1]); end = m[2] ? Number(m[2]) : total - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= total) throw new Error("range not satisfiable");
  return { start, end: Math.min(end, total - 1) };
}
export class D1MapBucket {
  constructor(private readonly db: D1Database) {}
  private manifest() { return this.db.prepare("SELECT total_bytes,chunk_bytes,chunk_count,sha256_hex,metadata_json,installed_at FROM map_manifest WHERE id=1").first<MapManifest>(); }
  async head(key: string) {
    const m = await this.manifest(); if (!m) return null;
    if (key === META_KEY) { const b = new TextEncoder().encode(m.metadata_json ?? "{}"); return fakeObject(key, b, "application/json"); }
    if (key !== MAP_KEY) return null;
    const obj = fakeObject(key, new Uint8Array(), "application/vnd.pmtiles", undefined, m.total_bytes); obj.etag = `\"${m.sha256_hex}\"`; obj.httpEtag = obj.etag; obj.uploaded = new Date(m.installed_at); return obj;
  }
  async get(key: string, options?: { range?: Headers; onlyIf?: Headers }) {
    const m = await this.manifest(); if (!m) return null;
    if (key === META_KEY) return fakeObject(key, new TextEncoder().encode(m.metadata_json ?? "{}"), "application/json");
    if (key !== MAP_KEY) return null;
    const etag = `\"${m.sha256_hex}\"`, ifNone = options?.onlyIf?.get?.("If-None-Match");
    if (ifNone === etag) return { key, size: m.total_bytes, etag: m.sha256_hex, httpEtag: etag, uploaded: new Date(m.installed_at) };
    let range = parseByteRange(options?.range?.get?.("Range") ?? null, m.total_bytes);
    if (!range) { if (m.total_bytes > 8_000_000) throw new Error("full PMTiles download disabled; use Range"); range = { start: 0, end: m.total_bytes - 1 }; }
    const first = Math.floor(range.start / m.chunk_bytes), last = Math.floor(range.end / m.chunk_bytes);
    const rows = await this.db.prepare("SELECT chunk_index,body FROM map_chunks WHERE chunk_index BETWEEN ?1 AND ?2 ORDER BY chunk_index").bind(first, last).all<{ chunk_index: number; body: unknown }>();
    if (rows.results.length !== last - first + 1) throw new Error("private map chunk missing");
    const length = range.end - range.start + 1, out = new Uint8Array(length); let written = 0;
    for (const row of rows.results) {
      const chunk = bytesFromD1(row.body), abs = row.chunk_index * m.chunk_bytes, from = Math.max(range.start, abs) - abs, to = Math.min(range.end + 1, abs + chunk.byteLength) - abs;
      if (to > from) { out.set(chunk.subarray(from, to), written); written += to - from; }
    }
    const obj = fakeObject(key, out, "application/vnd.pmtiles", undefined, m.total_bytes, { offset: range.start, length }); obj.etag = m.sha256_hex; obj.httpEtag = etag; obj.uploaded = new Date(m.installed_at); return obj;
  }
}

export function withD1ObjectStores<T extends { DB: D1Database; BRICK_DEVICE: DurableObjectNamespace<BrickDevice> }>(env: T) {
  const db = new D1FreeDatabase(env.DB) as unknown as D1Database, adapted = { ...env, DB: db };
  return { ...adapted, HISTORY: new D1HistoryBucket(db) as unknown as R2Bucket, EVENTS: new D1InlineEventQueue(adapted) as unknown as Queue };
}
export async function cleanupExpiredD1Objects(db: D1Database) {
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE history_hours SET raw_blob=NULL WHERE raw_blob IS NOT NULL AND raw_expires_at<=?1").bind(now),
    db.prepare("DELETE FROM history_hours WHERE trusted_expires_at<=?1").bind(now)
  ]);
}

export function estimatedFreeTierWritesPerDay() {
  const locations = DAY_MS / 3_000;
  const locationBase = locations * 2; // compact exact dedupe + hourly history append
  const deviceMetadataCheckpoints = locations / SEEN_BLOCK_SIZE;
  const health = (DAY_MS / 30_000) * 3; // health sample table + its index + devices health update
  const activeTripIdleCheckpoints = (DAY_MS / TRIP_IDLE_CHECKPOINT_MS) * 2; // trip row + state index
  return { locations, estimatedRowsWritten: locationBase + deviceMetadataCheckpoints + health + activeTripIdleCheckpoints, freeLimit: 100_000 };
}
