import { encodeTrustedDelta, gzipJson, trustedPoint } from "./history-codec";
import type { LivePacket } from "./protocol";

const CHUNK_BYTES = 900_000;
const MAX_OBJECT_BYTES = 32 * 1024 * 1024;
const HISTORY_SEGMENT_MS = 15 * 60 * 1000;
const MAP_KEY = "basemap/singapore.pmtiles";
const META_KEY = "basemap/singapore.meta.json";

type StoredMeta = {
  key: string;
  size: number;
  etag: string;
  uploaded_at: number;
  http_metadata_json: string;
  custom_metadata_json: string;
};

type ChunkRow = { body: ArrayBuffer | Uint8Array };
type RangeSpec = { offset: number; length: number } | null;
type HistoryKind = "raw" | "trusted";
type HistoryRow = {
  device_id: string;
  safe_device_id: string;
  epoch: number;
  sequence: number;
  wall_time_ms: number;
  segment_start_ms: number;
  trusted_packet_json: string;
  raw_packet_json: string;
  created_at: number;
};
type HistorySegmentRow = { segment_start_ms: number; epoch: number; max_created_at: number };
type QueueLocationBody = { type?: string; deviceId?: string; packet?: LivePacket; rawPacket?: LivePacket };

type PackedPacket = [
  number, number, number, number, number,
  number | null, number | null, number | null,
  number | null, number | null, number,
  number | null, number | null, number | null, number | null,
  number | null, number | null, number, number,
  number, number, number, number, number, number, number, number,
  LivePacket["routeCorridor"] | null
];

function ownBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function bytesOf(value: unknown): Promise<Uint8Array> {
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  if (value instanceof ReadableStream) return new Uint8Array(await new Response(value).arrayBuffer());
  throw new Error("unsupported development object body");
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", ownBuffer(bytes)));
  return Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
}

function safeJson(value: unknown) {
  try { return JSON.stringify(value ?? {}); }
  catch { return "{}"; }
}

function parseJson(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
  } catch { return {}; }
}

function applyHttpMetadata(headers: Headers, metadata: Record<string, string>) {
  const map: Record<string, string> = {
    contentType: "Content-Type",
    contentLanguage: "Content-Language",
    contentDisposition: "Content-Disposition",
    contentEncoding: "Content-Encoding",
    cacheControl: "Cache-Control",
    cacheExpiry: "Expires"
  };
  for (const [key, header] of Object.entries(map)) {
    const value = metadata[key];
    if (typeof value === "string" && value) headers.set(header, value);
  }
}

function parseRange(input: unknown, size: number): RangeSpec {
  if (!input) return null;
  if (input instanceof Headers) {
    const value = input.get("Range");
    if (!value) return null;
    const match = value.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) throw new Error("unsupported range");
    if (match[1]) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) throw new Error("invalid range");
      return { offset: start, length: Math.min(size - start, end - start + 1) };
    }
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error("invalid suffix range");
    const length = Math.min(size, suffix);
    return { offset: size - length, length };
  }
  if (typeof input === "object") {
    const r = input as { offset?: number; length?: number; suffix?: number };
    if (Number.isSafeInteger(r.offset) && Number.isSafeInteger(r.length) && (r.offset as number) >= 0 && (r.length as number) >= 0) {
      const offset = r.offset as number;
      if (offset >= size) throw new Error("range starts beyond object");
      return { offset, length: Math.min(r.length as number, size - offset) };
    }
    if (Number.isSafeInteger(r.suffix) && (r.suffix as number) > 0) {
      const length = Math.min(size, r.suffix as number);
      return { offset: size - length, length };
    }
  }
  return null;
}

function bodyObject(bytes: Uint8Array, meta: StoredMeta, range: RangeSpec = null) {
  const httpMetadata = parseJson(meta.http_metadata_json);
  const customMetadata = parseJson(meta.custom_metadata_json);
  const bodyBytes = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
  const buffer = ownBuffer(bodyBytes);
  return {
    key: meta.key,
    version: meta.etag,
    size: meta.size,
    etag: meta.etag,
    httpEtag: `"${meta.etag}"`,
    uploaded: new Date(meta.uploaded_at),
    httpMetadata,
    customMetadata,
    checksums: {},
    range: range ? { offset: range.offset, length: range.length } : undefined,
    body: new Blob([buffer]).stream(),
    bodyUsed: false,
    async arrayBuffer() { return buffer.slice(0); },
    async text() { return new TextDecoder().decode(buffer); },
    async json<T = unknown>() { return JSON.parse(new TextDecoder().decode(buffer)) as T; },
    async blob() { return new Blob([buffer], { type: httpMetadata.contentType || "application/octet-stream" }); },
    writeHttpMetadata(headers: Headers) { applyHttpMetadata(headers, httpMetadata); }
  };
}

function headObject(meta: StoredMeta) {
  const httpMetadata = parseJson(meta.http_metadata_json);
  return {
    key: meta.key,
    version: meta.etag,
    size: meta.size,
    etag: meta.etag,
    httpEtag: `"${meta.etag}"`,
    uploaded: new Date(meta.uploaded_at),
    httpMetadata,
    customMetadata: parseJson(meta.custom_metadata_json),
    checksums: {},
    writeHttpMetadata(headers: Headers) { applyHttpMetadata(headers, httpMetadata); }
  };
}

function safeDeviceId(id: string) { return id.replace(/[^a-zA-Z0-9_-]/g, "_"); }
function segmentStart(ms: number) { return Math.floor(ms / HISTORY_SEGMENT_MS) * HISTORY_SEGMENT_MS; }
function hhmm(ms: number) {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}-${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function virtualHistoryKey(kind: HistoryKind, safeDevice: string, start: number, epoch: number) {
  const day = new Date(start).toISOString().slice(0, 10);
  return `history/${kind}/${safeDevice}/${day}/${hhmm(start)}-e${epoch}.json.gz`;
}
function parseVirtualHistoryKey(key: string) {
  const m = key.match(/^history\/(raw|trusted)\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/(\d{2})-(\d{2})-e(\d+)\.json\.gz$/);
  if (!m) return null;
  const start = Date.parse(`${m[3]}T${m[4]}:${m[5]}:00.000Z`);
  const epoch = Number(m[6]);
  if (!Number.isFinite(start) || !Number.isSafeInteger(epoch) || epoch < 0) return null;
  return { kind: m[1] as HistoryKind, safeDevice: m[2], start, epoch };
}
function parseVirtualHistoryPrefix(prefix: string) {
  const m = prefix.match(/^history\/(raw|trusted)\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/$/);
  if (!m) return null;
  const start = Date.parse(`${m[3]}T00:00:00.000Z`);
  if (!Number.isFinite(start)) return null;
  return { kind: m[1] as HistoryKind, safeDevice: m[2], dayStart: start, dayEnd: start + 86_400_000 };
}

function packPacket(p: LivePacket): PackedPacket {
  const flags = (p.charging ? 1 : 0) | (p.rawAccepted ? 2 : 0) | (p.rawMock ? 4 : 0) | (p.fallback ? 8 : 0);
  return [
    p.version, p.epoch, p.sequence, p.elapsedRealtimeMs, p.wallTimeMs,
    p.rawLatE7, p.rawLonE7, p.rawAccuracyCm,
    p.trustedLatE7, p.trustedLonE7, p.uncertaintyCm,
    p.speedCms, p.speedAccuracyCms, p.bearingCdeg, p.bearingAccuracyCdeg,
    p.altitudeCm, p.verticalAccuracyCm, p.batteryPct, flags,
    p.activity, p.activityConfidence, p.quality, p.source,
    p.gnssUsedInFix, p.gnssTotal, p.gnssAverageCn0Tenth, p.stepDelta,
    p.routeCorridor ?? null
  ];
}

function unpackPacket(text: string): LivePacket {
  const p = JSON.parse(text) as PackedPacket;
  if (!Array.isArray(p) || p.length !== 28) throw new Error("invalid compact history packet");
  const flags = Number(p[18]);
  return {
    version: Number(p[0]), epoch: Number(p[1]), sequence: Number(p[2]), elapsedRealtimeMs: Number(p[3]), wallTimeMs: Number(p[4]),
    rawLatE7: p[5], rawLonE7: p[6], rawAccuracyCm: p[7],
    trustedLatE7: p[8], trustedLonE7: p[9], uncertaintyCm: Number(p[10]),
    speedCms: p[11], speedAccuracyCms: p[12], bearingCdeg: p[13], bearingAccuracyCdeg: p[14],
    altitudeCm: p[15], verticalAccuracyCm: p[16], batteryPct: Number(p[17]),
    charging: (flags & 1) !== 0, rawAccepted: (flags & 2) !== 0, rawMock: (flags & 4) !== 0, fallback: (flags & 8) !== 0,
    activity: Number(p[19]), activityConfidence: Number(p[20]), quality: Number(p[21]), source: Number(p[22]),
    gnssUsedInFix: Number(p[23]), gnssTotal: Number(p[24]), gnssAverageCn0Tenth: Number(p[25]), stepDelta: Number(p[26]),
    routeCorridor: p[27] ?? undefined
  };
}

async function virtualHistoryObject(db: D1Database, key: string) {
  const parsed = parseVirtualHistoryKey(key);
  if (!parsed) return null;
  const rows = await db.prepare(
    "SELECT device_id,safe_device_id,epoch,sequence,wall_time_ms,segment_start_ms,trusted_packet_json,raw_packet_json,created_at " +
    "FROM dev_location_history WHERE safe_device_id=?1 AND segment_start_ms=?2 AND epoch=?3 ORDER BY sequence"
  ).bind(parsed.safeDevice, parsed.start, parsed.epoch).all<HistoryRow>();
  if (!rows.results.length) return null;
  const trustedPackets = rows.results.map(row => unpackPacket(row.trusted_packet_json));
  const rawPackets = rows.results.map(row => unpackPacket(row.raw_packet_json));
  const deviceId = rows.results[0].device_id;
  const storedAt = Math.max(...rows.results.map(row => row.created_at));
  const body = parsed.kind === "raw"
    ? await gzipJson({ v: 4, deviceId, segmentStartMs: parsed.start, storedAt, packets: rawPackets, trustedPackets })
    : await gzipJson({ v: 4, deviceId, segmentStartMs: parsed.start, storedAt, delta: encodeTrustedDelta(trustedPackets.map(trustedPoint)) });
  const bytes = new Uint8Array(body);
  const etag = await sha256Hex(bytes);
  const meta: StoredMeta = {
    key,
    size: bytes.byteLength,
    etag,
    uploaded_at: storedAt,
    http_metadata_json: JSON.stringify({ contentType: "application/json", contentEncoding: "gzip" }),
    custom_metadata_json: JSON.stringify({
      deviceId,
      kind: parsed.kind,
      codec: parsed.kind === "raw" ? "json-gzip-v4-virtual" : "delta-gzip-v4-virtual",
      segmentMinutes: "15",
      epoch: String(parsed.epoch),
      storage: "d1-append-virtual"
    })
  };
  return bodyObject(bytes, meta);
}

async function virtualHistoryList(db: D1Database, prefix: string, offset: number, limit: number) {
  const parsed = parseVirtualHistoryPrefix(prefix);
  if (!parsed) return null;
  const rows = await db.prepare(
    "SELECT segment_start_ms,epoch,MAX(created_at) AS max_created_at FROM dev_location_history " +
    "WHERE safe_device_id=?1 AND segment_start_ms>=?2 AND segment_start_ms<?3 " +
    "GROUP BY segment_start_ms,epoch ORDER BY segment_start_ms,epoch LIMIT ?4 OFFSET ?5"
  ).bind(parsed.safeDevice, parsed.dayStart, parsed.dayEnd, limit + 1, offset).all<HistorySegmentRow>();
  const truncated = rows.results.length > limit;
  const page = rows.results.slice(0, limit);
  return {
    objects: page.map(row => headObject({
      key: virtualHistoryKey(parsed.kind, parsed.safeDevice, row.segment_start_ms, row.epoch),
      size: 0,
      etag: `virtual-${row.epoch}-${row.segment_start_ms}-${row.max_created_at}`,
      uploaded_at: row.max_created_at,
      http_metadata_json: JSON.stringify({ contentType: "application/json", contentEncoding: "gzip" }),
      custom_metadata_json: JSON.stringify({ kind: parsed.kind, storage: "d1-append-virtual" })
    })),
    truncated,
    cursor: truncated ? String(offset + limit) : undefined,
    delimitedPrefixes: [] as string[]
  };
}

class D1ObjectBucket {
  constructor(private readonly db: D1Database) {}

  async put(key: string, value: unknown, options: Record<string, unknown> = {}) {
    if (!key || key.length > 1024) throw new Error("invalid development object key");
    const bytes = await bytesOf(value);
    if (bytes.byteLength > MAX_OBJECT_BYTES) throw new Error(`development object exceeds ${MAX_OBJECT_BYTES} byte safety limit`);
    const etag = await sha256Hex(bytes);
    const now = Date.now();
    const httpMetadata = safeJson(options.httpMetadata);
    const customMetadata = safeJson(options.customMetadata);
    const statements: D1PreparedStatement[] = [
      this.db.prepare("DELETE FROM dev_object_chunks WHERE key=?1").bind(key),
      this.db.prepare(
        "INSERT INTO dev_object_store(key,size,etag,uploaded_at,http_metadata_json,custom_metadata_json) VALUES(?1,?2,?3,?4,?5,?6) " +
        "ON CONFLICT(key) DO UPDATE SET size=excluded.size,etag=excluded.etag,uploaded_at=excluded.uploaded_at,http_metadata_json=excluded.http_metadata_json,custom_metadata_json=excluded.custom_metadata_json"
      ).bind(key, bytes.byteLength, etag, now, httpMetadata, customMetadata)
    ];
    for (let offset = 0, index = 0; offset < bytes.byteLength; offset += CHUNK_BYTES, index++) {
      const part = bytes.slice(offset, Math.min(bytes.byteLength, offset + CHUNK_BYTES));
      statements.push(this.db.prepare("INSERT INTO dev_object_chunks(key,chunk_index,body) VALUES(?1,?2,?3)").bind(key, index, ownBuffer(part)));
    }
    await this.db.batch(statements);
    return headObject({ key, size: bytes.byteLength, etag, uploaded_at: now, http_metadata_json: httpMetadata, custom_metadata_json: customMetadata });
  }

  private async meta(key: string) {
    return this.db.prepare(
      "SELECT key,size,etag,uploaded_at,http_metadata_json,custom_metadata_json FROM dev_object_store WHERE key=?1"
    ).bind(key).first<StoredMeta>();
  }

  async head(key: string) {
    const virtual = await virtualHistoryObject(this.db, key);
    if (virtual) return virtual;
    const meta = await this.meta(key);
    return meta ? headObject(meta) : null;
  }

  async get(key: string, options: { range?: unknown } = {}) {
    const virtual = await virtualHistoryObject(this.db, key);
    if (virtual) return virtual;
    const meta = await this.meta(key);
    if (!meta) return null;
    const rows = await this.db.prepare("SELECT body FROM dev_object_chunks WHERE key=?1 ORDER BY chunk_index").bind(key).all<ChunkRow>();
    const chunks = rows.results.map(row => {
      if (row.body instanceof ArrayBuffer) return new Uint8Array(row.body);
      if (ArrayBuffer.isView(row.body)) return new Uint8Array(row.body.buffer, row.body.byteOffset, row.body.byteLength);
      throw new Error("invalid D1 object chunk");
    });
    const bytes = new Uint8Array(meta.size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if (offset !== meta.size) throw new Error("development object is incomplete");
    const range = parseRange(options.range, meta.size);
    return bodyObject(bytes, meta, range);
  }

  async delete(keys: string | string[]) {
    const list = Array.isArray(keys) ? keys : [keys];
    if (!list.length) return;
    const statements: D1PreparedStatement[] = [];
    for (const key of list) {
      statements.push(this.db.prepare("DELETE FROM dev_object_chunks WHERE key=?1").bind(key));
      statements.push(this.db.prepare("DELETE FROM dev_object_store WHERE key=?1").bind(key));
    }
    await this.db.batch(statements);
  }

  async list(options: { prefix?: string; cursor?: string; limit?: number } = {}) {
    const prefix = options.prefix ?? "";
    const offset = Math.max(0, Number(options.cursor || "0") || 0);
    const limit = Math.max(1, Math.min(1000, Number(options.limit ?? 1000)));
    const virtual = await virtualHistoryList(this.db, prefix, offset, limit);
    if (virtual) return virtual;
    const rows = await this.db.prepare(
      "SELECT key,size,etag,uploaded_at,http_metadata_json,custom_metadata_json FROM dev_object_store WHERE key LIKE ?1 ESCAPE '\\' ORDER BY key LIMIT ?2 OFFSET ?3"
    ).bind(`${prefix.replace(/[\\%_]/g, "\\$&")}%`, limit + 1, offset).all<StoredMeta>();
    const truncated = rows.results.length > limit;
    const page = rows.results.slice(0, limit);
    return {
      objects: page.map(headObject),
      truncated,
      cursor: truncated ? String(offset + limit) : undefined,
      delimitedPrefixes: []
    };
  }
}

function remoteMeta(source: string, size: number, etag: string): StoredMeta {
  return {
    key: MAP_KEY,
    size,
    etag,
    uploaded_at: 0,
    http_metadata_json: JSON.stringify({ contentType: "application/vnd.pmtiles", cacheControl: "private, max-age=86400" }),
    custom_metadata_json: JSON.stringify({ source, mode: "same-origin-worker-proxy", region: "singapore" })
  };
}

async function remoteSize(source: string) {
  const head = await fetch(source, { method: "HEAD", redirect: "follow" });
  if (head.ok) {
    const n = Number(head.headers.get("Content-Length"));
    if (Number.isSafeInteger(n) && n > 0) return { size: n, etag: head.headers.get("ETag")?.replace(/^W\//, "").replaceAll('"', "") || `remote-${n}` };
  }
  const probe = await fetch(source, { headers: { Range: "bytes=0-0" }, redirect: "follow" });
  if (!probe.ok && probe.status !== 206) throw new Error(`map source unavailable: HTTP ${probe.status}`);
  const contentRange = probe.headers.get("Content-Range") ?? "";
  const match = contentRange.match(/\/(\d+)$/);
  const size = match ? Number(match[1]) : Number(probe.headers.get("Content-Length"));
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error("map source size unavailable");
  return { size, etag: probe.headers.get("ETag")?.replace(/^W\//, "").replaceAll('"', "") || `remote-${size}` };
}

class RemoteMapBucket {
  private info: Promise<{ size: number; etag: string }> | null = null;
  private readonly memory = new Map<string, ArrayBuffer>();
  constructor(private readonly source: string) {}

  private sourceInfo() { return this.info ??= remoteSize(this.source); }

  async head(key: string) {
    if (key !== MAP_KEY) return null;
    const { size, etag } = await this.sourceInfo();
    return headObject(remoteMeta(this.source, size, etag));
  }

  async get(key: string, options: { range?: unknown } = {}) {
    if (key === META_KEY) {
      const { size, etag } = await this.sourceInfo();
      const body = new TextEncoder().encode(JSON.stringify({
        region: "singapore",
        source: this.source,
        sourceType: "Protomaps OSM-derived daily basemap proxied by Brick Worker",
        bytes: size,
        etag,
        installed: true,
        storage: "remote-proxy-no-r2",
        attribution: "© OpenStreetMap contributors · Protomaps"
      }));
      const meta: StoredMeta = {
        key: META_KEY,
        size: body.byteLength,
        etag: await sha256Hex(body),
        uploaded_at: 0,
        http_metadata_json: JSON.stringify({ contentType: "application/json" }),
        custom_metadata_json: "{}"
      };
      return bodyObject(body, meta);
    }
    if (key !== MAP_KEY) return null;
    const { size, etag } = await this.sourceInfo();
    const range = parseRange(options.range, size);
    if (!range) throw new Error("development map proxy requires byte-range requests");
    const cacheKey = `${range.offset}:${range.length}:${etag}`;
    const cached = this.memory.get(cacheKey);
    if (cached) return bodyObject(new Uint8Array(cached), remoteMeta(this.source, size, etag), { offset: 0, length: cached.byteLength });
    const end = range.offset + range.length - 1;
    const response = await fetch(this.source, {
      headers: { Range: `bytes=${range.offset}-${end}` },
      redirect: "follow",
      cf: { cacheEverything: true, cacheTtl: 86400 }
    });
    if (!(response.ok || response.status === 206)) throw new Error(`map range unavailable: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== range.length) throw new Error("map range length mismatch");
    this.memory.set(cacheKey, buffer.slice(0));
    while (this.memory.size > 128) this.memory.delete(this.memory.keys().next().value as string);
    const obj = bodyObject(new Uint8Array(buffer), remoteMeta(this.source, size, etag), { offset: 0, length: buffer.byteLength });
    return { ...obj, range: { offset: range.offset, length: range.length } };
  }
}

function validLocationBody(body: unknown): body is Required<Pick<QueueLocationBody, "deviceId" | "packet" | "rawPacket">> & { type: "location" } {
  if (!body || typeof body !== "object") return false;
  const value = body as QueueLocationBody;
  return value.type === "location" && typeof value.deviceId === "string" && !!value.packet && !!value.rawPacket &&
    Number.isSafeInteger(value.packet.epoch) && Number.isSafeInteger(value.packet.sequence) && Number.isSafeInteger(value.packet.wallTimeMs);
}

class DirectEventQueue {
  constructor(private readonly db: D1Database) {}

  async send(body: unknown) {
    const type = body && typeof body === "object" ? (body as { type?: unknown }).type : undefined;
    if (type === "safety_receipt") return;
    await this.persist([body]);
  }

  async sendBatch(entries: readonly { body: unknown }[]) {
    await this.persist(entries.map(entry => entry.body));
  }

  private async persist(bodies: unknown[]) {
    const locations = bodies.filter(validLocationBody);
    if (!locations.length) return;
    const now = Date.now();
    for (let start = 0; start < locations.length; start += 10) {
      const group = locations.slice(start, start + 10);
      const bindings: unknown[] = [];
      const values = group.map((body, index) => {
        const base = index * 9;
        const packet = body.packet;
        bindings.push(
          body.deviceId,
          safeDeviceId(body.deviceId),
          packet.epoch,
          packet.sequence,
          packet.wallTimeMs,
          segmentStart(packet.wallTimeMs),
          JSON.stringify(packPacket(packet)),
          JSON.stringify(packPacket(body.rawPacket)),
          now
        );
        return `(?${base + 1},?${base + 2},?${base + 3},?${base + 4},?${base + 5},?${base + 6},?${base + 7},?${base + 8},?${base + 9})`;
      }).join(",");
      await this.db.prepare(
        `INSERT OR IGNORE INTO dev_location_history(device_id,safe_device_id,epoch,sequence,wall_time_ms,segment_start_ms,trusted_packet_json,raw_packet_json,created_at) VALUES ${values}`
      ).bind(...bindings).run();
    }
  }
}

const historyBuckets = new WeakMap<object, R2Bucket>();
const mapBuckets = new Map<string, R2Bucket>();

export function developmentRuntimeEnv<T extends Record<string, unknown>>(env: T): T {
  const db = env.DB as D1Database | undefined;
  if (!db) throw new Error("development D1 binding missing");
  const dbKey = db as unknown as object;
  let history = historyBuckets.get(dbKey);
  if (!history) {
    history = new D1ObjectBucket(db) as unknown as R2Bucket;
    historyBuckets.set(dbKey, history);
  }
  const source = String(env.BRICK_MAP_SOURCE || "");
  if (!/^https:\/\//i.test(source)) throw new Error("development map source missing");
  let maps = mapBuckets.get(source);
  if (!maps) {
    maps = new RemoteMapBucket(source) as unknown as R2Bucket;
    mapBuckets.set(source, maps);
  }
  return {
    ...env,
    HISTORY: history,
    MAPS: maps,
    EVENTS: new DirectEventQueue(db) as unknown as Queue
  };
}

export async function cleanupDevelopmentObjectStore(db: D1Database, now = Date.now()) {
  const rules = [
    ["history/raw/%", 14],
    ["history/trusted/%", 30],
    ["history/hypotheses/%", 14],
    ["history/refined/%", 30],
    ["evidence/raw/%", 14],
    ["backups/d1/%", 7]
  ] as const;
  for (const [pattern, days] of rules) {
    const cutoff = now - days * 86_400_000;
    const rows = await db.prepare("SELECT key FROM dev_object_store WHERE key LIKE ?1 AND uploaded_at<?2 ORDER BY uploaded_at LIMIT 200").bind(pattern, cutoff).all<{ key: string }>();
    if (!rows.results.length) continue;
    const bucket = new D1ObjectBucket(db);
    await bucket.delete(rows.results.map(row => row.key));
  }

  // History rows are already compact (one append per accepted fix). Cap cleanup work so a busy day
  // cannot itself consume the Free-plan write budget. Normal adaptive tracking remains bounded; an
  // extreme 24/7 high-frequency test degrades by retaining extra old rows rather than dropping new data.
  const historyCutoff = now - 35 * 86_400_000;
  await db.prepare(
    "DELETE FROM dev_location_history WHERE rowid IN (SELECT rowid FROM dev_location_history WHERE wall_time_ms<?1 ORDER BY wall_time_ms LIMIT 5000)"
  ).bind(historyCutoff).run();
}
