import { processHistoryBatch } from "./history-store";

const CHUNK_BYTES = 900_000;
const MAX_OBJECT_BYTES = 32 * 1024 * 1024;
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

type DirectQueueMessage = {
  body: unknown;
  retried: boolean;
  acked: boolean;
  ack(): void;
  retry(): void;
};

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
    const meta = await this.meta(key);
    return meta ? headObject(meta) : null;
  }

  async get(key: string, options: { range?: unknown } = {}) {
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
    const rows = await this.db.prepare(
      "SELECT key,size,etag,uploaded_at,http_metadata_json,custom_metadata_json FROM dev_object_store WHERE key LIKE ?1 ORDER BY key LIMIT ?2 OFFSET ?3"
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

function directMessage(body: unknown): DirectQueueMessage {
  return {
    body,
    retried: false,
    acked: false,
    ack() { this.acked = true; },
    retry() { this.retried = true; }
  };
}

class DirectEventQueue {
  constructor(private readonly history: R2Bucket) {}

  async send(body: unknown) {
    const type = body && typeof body === "object" ? (body as { type?: unknown }).type : undefined;
    if (type === "safety_receipt") return;
    await this.persist([body]);
  }

  async sendBatch(entries: readonly { body: unknown }[]) {
    await this.persist(entries.map(entry => entry.body));
  }

  private async persist(bodies: unknown[]) {
    const messages = bodies.map(directMessage);
    const result = await processHistoryBatch({ messages: messages as unknown as readonly Message<unknown>[] }, { HISTORY: this.history });
    if (result.retriedMessages > 0 || messages.some(message => message.retried)) {
      throw new Error("development direct history persistence failed");
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
    EVENTS: new DirectEventQueue(history) as unknown as Queue
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
}
