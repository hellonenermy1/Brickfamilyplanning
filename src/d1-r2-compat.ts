const DAY_MS = 86_400_000;
const HISTORY_NAMESPACE = "history";
const MAP_KEY = "basemap/singapore.pmtiles";
const META_KEY = "basemap/singapore.meta.json";

function bytesFromD1(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value.map(Number));
  throw new Error("invalid D1 BLOB value");
}

function streamOf(bytes: Uint8Array) {
  return new Blob([bytes]).stream();
}

function fakeObject(key: string, bytes: Uint8Array, contentType = "application/octet-stream", contentEncoding?: string, metadata: Record<string, string> = {}, sizeOverride?: number, range?: { offset: number; length: number }) {
  const totalSize = sizeOverride ?? bytes.byteLength;
  const etag = `\"d1-${totalSize}-${key.length}\"`;
  return {
    key,
    version: "d1",
    size: totalSize,
    etag,
    httpEtag: etag,
    uploaded: new Date(),
    httpMetadata: { contentType, contentEncoding },
    customMetadata: metadata,
    range,
    body: streamOf(bytes),
    bodyUsed: false,
    checksums: {},
    storageClass: "Standard",
    writeHttpMetadata(headers: Headers) {
      if (contentType) headers.set("Content-Type", contentType);
      if (contentEncoding) headers.set("Content-Encoding", contentEncoding);
    },
    async arrayBuffer() { return bytes.slice().buffer; },
    async text() { return new TextDecoder().decode(bytes); },
    async json<T>() { return JSON.parse(new TextDecoder().decode(bytes)) as T; },
    async blob() { return new Blob([bytes], { type: contentType }); }
  };
}

async function toBytes(value: unknown): Promise<Uint8Array> {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof ReadableStream) return new Uint8Array(await new Response(value).arrayBuffer());
  if (value instanceof Blob) return new Uint8Array(await value.arrayBuffer());
  throw new Error("unsupported D1 object value");
}

export class D1HistoryBucket {
  constructor(private readonly db: D1Database) {}

  async put(key: string, value: unknown, options?: { httpMetadata?: { contentType?: string; contentEncoding?: string }; customMetadata?: Record<string, string> }) {
    const bytes = await toBytes(value);
    if (bytes.byteLength > 1_800_000) throw new Error(`history chunk too large for D1 row: ${bytes.byteLength}`);
    const now = Date.now();
    const expiresAt = key.startsWith("history/raw/") ? now + 30 * DAY_MS : key.startsWith("history/trusted/") ? now + 90 * DAY_MS : null;
    await this.db.prepare(
      "INSERT INTO blob_objects(namespace,object_key,created_at,expires_at,content_type,content_encoding,metadata_json,byte_length,body) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(namespace,object_key) DO NOTHING"
    ).bind(
      HISTORY_NAMESPACE,
      key,
      now,
      expiresAt,
      options?.httpMetadata?.contentType ?? null,
      options?.httpMetadata?.contentEncoding ?? null,
      JSON.stringify(options?.customMetadata ?? {}),
      bytes.byteLength,
      bytes
    ).run();
    return { key };
  }

  async get(key: string) {
    const row = await this.db.prepare(
      "SELECT body,content_type,content_encoding,metadata_json,byte_length,created_at FROM blob_objects WHERE namespace=?1 AND object_key=?2 AND (expires_at IS NULL OR expires_at>?3)"
    ).bind(HISTORY_NAMESPACE, key, Date.now()).first<{ body: unknown; content_type: string | null; content_encoding: string | null; metadata_json: string | null; byte_length: number; created_at: number }>();
    if (!row) return null;
    const bytes = bytesFromD1(row.body);
    const metadata = row.metadata_json ? JSON.parse(row.metadata_json) as Record<string, string> : {};
    const obj = fakeObject(key, bytes, row.content_type ?? "application/octet-stream", row.content_encoding ?? undefined, metadata);
    obj.uploaded = new Date(row.created_at);
    return obj;
  }

  async list(options: { prefix?: string; cursor?: string; limit?: number } = {}) {
    const prefix = options.prefix ?? "";
    const after = options.cursor ?? "";
    const limit = Math.max(1, Math.min(1000, options.limit ?? 1000));
    const rows = await this.db.prepare(
      "SELECT object_key,byte_length,created_at FROM blob_objects WHERE namespace=?1 AND object_key LIKE ?2 AND object_key>?3 AND (expires_at IS NULL OR expires_at>?4) ORDER BY object_key LIMIT ?5"
    ).bind(HISTORY_NAMESPACE, `${prefix}%`, after, Date.now(), limit + 1).all<{ object_key: string; byte_length: number; created_at: number }>();
    const selected = rows.results.slice(0, limit);
    const truncated = rows.results.length > limit;
    return {
      objects: selected.map(r => ({ key: r.object_key, size: r.byte_length, uploaded: new Date(r.created_at) })),
      truncated,
      cursor: truncated && selected.length ? selected[selected.length - 1].object_key : undefined,
      delimitedPrefixes: [] as string[]
    };
  }
}

type MapManifest = {
  total_bytes: number;
  chunk_bytes: number;
  chunk_count: number;
  sha256_hex: string;
  metadata_json: string | null;
  installed_at: number;
};

function parseByteRange(value: string | null, total: number) {
  if (!value) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!m) throw new Error("invalid range");
  if (!m[1] && !m[2]) throw new Error("invalid range");
  let start: number, end: number;
  if (!m[1]) {
    const suffix = Math.max(1, Number(m[2]));
    start = Math.max(0, total - suffix); end = total - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Number(m[2]) : total - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= total) throw new Error("range not satisfiable");
  return { start, end: Math.min(end, total - 1) };
}

export class D1MapBucket {
  constructor(private readonly db: D1Database) {}

  private manifest() {
    return this.db.prepare("SELECT total_bytes,chunk_bytes,chunk_count,sha256_hex,metadata_json,installed_at FROM map_manifest WHERE id=1").first<MapManifest>();
  }

  async head(key: string) {
    const m = await this.manifest();
    if (!m) return null;
    if (key === META_KEY) {
      const bytes = new TextEncoder().encode(m.metadata_json ?? "{}");
      return fakeObject(key, bytes, "application/json", undefined, {}, bytes.byteLength);
    }
    if (key !== MAP_KEY) return null;
    const empty = new Uint8Array();
    const obj = fakeObject(key, empty, "application/vnd.pmtiles", undefined, {}, m.total_bytes);
    obj.etag = `\"${m.sha256_hex}\"`; obj.httpEtag = obj.etag; obj.uploaded = new Date(m.installed_at);
    return obj;
  }

  async get(key: string, options?: { range?: Headers; onlyIf?: Headers }) {
    const m = await this.manifest();
    if (!m) return null;
    if (key === META_KEY) {
      const bytes = new TextEncoder().encode(m.metadata_json ?? "{}");
      return fakeObject(key, bytes, "application/json");
    }
    if (key !== MAP_KEY) return null;
    const ifNone = options?.onlyIf?.get?.("If-None-Match");
    const etag = `\"${m.sha256_hex}\"`;
    if (ifNone && ifNone === etag) return { key, size: m.total_bytes, etag: m.sha256_hex, httpEtag: etag, uploaded: new Date(m.installed_at) };
    let range: { start: number; end: number } | null;
    try { range = parseByteRange(options?.range?.get?.("Range") ?? null, m.total_bytes); }
    catch { return null; }
    if (!range) {
      // PMTiles clients use byte ranges. Refuse a huge whole-file materialization in a 128 MB Worker.
      if (m.total_bytes > 8_000_000) throw new Error("full PMTiles download is disabled; use HTTP Range requests");
      range = { start: 0, end: m.total_bytes - 1 };
    }
    const first = Math.floor(range.start / m.chunk_bytes), last = Math.floor(range.end / m.chunk_bytes);
    const rows = await this.db.prepare("SELECT chunk_index,body FROM map_chunks WHERE chunk_index BETWEEN ?1 AND ?2 ORDER BY chunk_index").bind(first, last).all<{ chunk_index: number; body: unknown }>();
    if (rows.results.length !== last - first + 1) throw new Error("private map chunk missing");
    const length = range.end - range.start + 1;
    const out = new Uint8Array(length);
    let written = 0;
    for (const row of rows.results) {
      const chunk = bytesFromD1(row.body);
      const absoluteStart = row.chunk_index * m.chunk_bytes;
      const from = Math.max(range.start, absoluteStart) - absoluteStart;
      const to = Math.min(range.end + 1, absoluteStart + chunk.byteLength) - absoluteStart;
      if (to > from) { out.set(chunk.subarray(from, to), written); written += to - from; }
    }
    const obj = fakeObject(key, out, "application/vnd.pmtiles", undefined, {}, m.total_bytes, { offset: range.start, length });
    obj.etag = m.sha256_hex; obj.httpEtag = etag; obj.uploaded = new Date(m.installed_at);
    return obj;
  }
}

export function withD1ObjectStores<T extends { DB: D1Database }>(env: T) {
  return {
    ...env,
    HISTORY: new D1HistoryBucket(env.DB) as unknown as R2Bucket
  };
}

export async function cleanupExpiredD1Objects(db: D1Database) {
  await db.prepare("DELETE FROM blob_objects WHERE expires_at IS NOT NULL AND expires_at<?1").bind(Date.now()).run();
}
