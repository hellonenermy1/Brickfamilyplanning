export const EVIDENCE_PROTOCOL_VERSION = 1;
export const EVIDENCE_MAX_RECORDS = 24;
export const EVIDENCE_MAX_RECORD_PAYLOAD_BYTES = 2_048;
export const EVIDENCE_MAX_INDEPENDENCE_GROUP_BYTES = 64;
export const EVIDENCE_MAX_BATCH_BYTES = 65_536;
const MAGIC = 0x42524556; // BREV
const HEADER_BYTES = 4 + 1 + 16 + 2;
const RECORD_FIXED_BYTES = 16 + 4 + 8 + 8 + 8 + 5 + 1 + 2;
const MAX_ANDROID_EPOCH = 0x7fffffff;

export type EvidenceRecord = {
  recordId: string;
  epoch: number;
  sequence: number;
  elapsedRealtimeMs: number;
  wallTimeMs: number;
  provider: number;
  family: number;
  capability: number;
  health: number;
  quality: number;
  independenceGroup: string;
  payload: Uint8Array;
};

export type EvidenceBatch = {
  protocol: 1;
  batchId: string;
  records: EvidenceRecord[];
};

// Provider 22 is the Phase 5 durable degraded-hypothesis frame used only for backward smoothing.
const validProviders = new Set([...Array.from({ length: 22 }, (_, i) => i + 1), 255]);
const validFamilies = new Set([...Array.from({ length: 13 }, (_, i) => i + 1), 255]);

function safeU64(view: DataView, offset: number, field: string): number {
  const raw = view.getBigUint64(offset, false);
  if (raw > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${field} exceeds safe integer range`);
  return Number(raw);
}

function uuidAt(view: DataView, offset: number): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, 16);
  const hex = [...bytes].map(v => v.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function requireRange(value: number, allowed: Set<number>, name: string) {
  if (!allowed.has(value)) throw new Error(`unknown ${name}`);
}

export function decodeEvidenceBatch(buffer: ArrayBuffer): EvidenceBatch {
  if (buffer.byteLength < HEADER_BYTES || buffer.byteLength > EVIDENCE_MAX_BATCH_BYTES) throw new Error("invalid evidence batch size");
  const view = new DataView(buffer);
  if (view.getUint32(0, false) !== MAGIC) throw new Error("invalid evidence magic");
  if (view.getUint8(4) !== EVIDENCE_PROTOCOL_VERSION) throw new Error("unsupported evidence protocol");
  const batchId = uuidAt(view, 5);
  const count = view.getUint16(21, false);
  if (count < 1 || count > EVIDENCE_MAX_RECORDS) throw new Error("invalid evidence record count");

  const records: EvidenceRecord[] = [];
  const ids = new Set<string>();
  let o = HEADER_BYTES;
  const decoder = new TextDecoder("utf-8", { fatal: true });

  for (let i = 0; i < count; i++) {
    if (view.byteLength - o < RECORD_FIXED_BYTES) throw new Error("truncated evidence record");
    const recordId = uuidAt(view, o); o += 16;
    const epoch = view.getUint32(o, false); o += 4;
    const sequence = safeU64(view, o, "evidence sequence"); o += 8;
    const elapsedRealtimeMs = safeU64(view, o, "evidence elapsed realtime"); o += 8;
    const wallTimeMs = safeU64(view, o, "evidence wall time"); o += 8;
    const provider = view.getUint8(o++);
    const family = view.getUint8(o++);
    const capability = view.getUint8(o++);
    const health = view.getUint8(o++);
    const quality = view.getUint8(o++);
    const groupLength = view.getUint8(o++);
    const payloadLength = view.getUint16(o, false); o += 2;

    if (epoch > MAX_ANDROID_EPOCH) throw new Error("evidence epoch outside Android wire range");
    requireRange(provider, validProviders, "evidence provider");
    requireRange(family, validFamilies, "evidence family");
    if (capability > 3) throw new Error("unknown provider capability");
    if (health > 3) throw new Error("unknown provider health");
    if (quality > 3) throw new Error("unknown evidence quality");
    if (sequence <= 0 || wallTimeMs <= 0 || elapsedRealtimeMs < 0) throw new Error("bad evidence ordering fields");
    if (groupLength < 1 || groupLength > EVIDENCE_MAX_INDEPENDENCE_GROUP_BYTES) throw new Error("invalid independence group length");
    if (payloadLength > EVIDENCE_MAX_RECORD_PAYLOAD_BYTES) throw new Error("evidence payload too large");
    if (view.byteLength - o < groupLength + payloadLength) throw new Error("truncated evidence body");

    const groupBytes = new Uint8Array(buffer, o, groupLength); o += groupLength;
    const independenceGroup = decoder.decode(groupBytes);
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(independenceGroup)) throw new Error("invalid independence group");
    const payload = new Uint8Array(buffer.slice(o, o + payloadLength)); o += payloadLength;

    if (ids.has(recordId)) throw new Error("duplicate evidence recordId");
    ids.add(recordId);
    const prior = records.at(-1);
    if (prior && !(epoch > prior.epoch || (epoch === prior.epoch && sequence > prior.sequence))) {
      throw new Error("evidence records must be strictly ordered");
    }
    records.push({ recordId, epoch, sequence, elapsedRealtimeMs, wallTimeMs, provider, family, capability, health, quality, independenceGroup, payload });
  }

  if (o !== view.byteLength) throw new Error("trailing bytes in evidence batch");
  return { protocol: 1, batchId, records };
}
