import type { LivePacket } from "./protocol";

export type HistoryPoint = {
  epoch: number;
  sequence: number;
  wallTimeMs: number;
  /**
   * Optional server-side provenance added by Phase 8 when reading a history segment. This is not
   * part of the compressed coordinate delta because it describes ingestion, not movement. Older
   * v2/v4 history remains readable with the field absent.
   */
  serverReceivedAtMs?: number;
  trustedLatE7: number | null;
  trustedLonE7: number | null;
  uncertaintyCm: number;
  speedCms: number | null;
  speedAccuracyCms: number | null;
  bearingCdeg: number | null;
  batteryPct: number;
  charging: boolean;
  activity: number;
  activityConfidence: number;
  quality: number;
  source: number;
  fallback: boolean;
  rawAccepted: boolean;
};

type FirstRow = [number, number, number | null, number | null, number, number | null, number | null, number | null, number, number, number, number, number, number];
type DeltaRow = [number, number, number, number | null, number | null, number, number | null, number | null, number | null, number, number, number, number, number, number];
export type DeltaHistory = { v: 2; epoch: number; first: FirstRow | null; rows: DeltaRow[] };

export function trustedPoint(p: LivePacket): HistoryPoint {
  return {
    epoch: p.epoch, sequence: p.sequence, wallTimeMs: p.wallTimeMs,
    trustedLatE7: p.trustedLatE7, trustedLonE7: p.trustedLonE7,
    uncertaintyCm: p.uncertaintyCm, speedCms: p.speedCms, speedAccuracyCms: p.speedAccuracyCms,
    bearingCdeg: p.bearingCdeg, batteryPct: p.batteryPct, charging: p.charging,
    activity: p.activity, activityConfidence: p.activityConfidence, quality: p.quality, source: p.source,
    fallback: p.fallback, rawAccepted: p.rawAccepted
  };
}

function flags(p: HistoryPoint) { return (p.charging ? 1 : 0) | (p.fallback ? 2 : 0) | (p.rawAccepted ? 4 : 0); }
function fromFlags(v: number) { return { charging: (v & 1) !== 0, fallback: (v & 2) !== 0, rawAccepted: (v & 4) !== 0 }; }

export function encodeTrustedDelta(points: HistoryPoint[]): DeltaHistory {
  if (!points.length) return { v: 2, epoch: 0, first: null, rows: [] };
  const epoch = points[0].epoch;
  if (points.some(p => p.epoch !== epoch)) throw new Error("history chunk spans epochs");
  const p0 = points[0];
  const first: FirstRow = [p0.sequence, p0.wallTimeMs, p0.trustedLatE7, p0.trustedLonE7, p0.uncertaintyCm, p0.speedCms, p0.speedAccuracyCms, p0.bearingCdeg, p0.batteryPct, flags(p0), p0.activity, p0.activityConfidence, p0.quality, p0.source];
  const rows: DeltaRow[] = [];
  let prev = p0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    let mode = 0, lat: number | null = null, lon: number | null = null;
    if (p.trustedLatE7 !== null && p.trustedLonE7 !== null) {
      if (prev.trustedLatE7 !== null && prev.trustedLonE7 !== null) {
        mode = 1; lat = p.trustedLatE7 - prev.trustedLatE7; lon = p.trustedLonE7 - prev.trustedLonE7;
      } else {
        mode = 2; lat = p.trustedLatE7; lon = p.trustedLonE7;
      }
    }
    rows.push([p.sequence - prev.sequence, p.wallTimeMs - prev.wallTimeMs, mode, lat, lon, p.uncertaintyCm, p.speedCms, p.speedAccuracyCms, p.bearingCdeg, p.batteryPct, flags(p), p.activity, p.activityConfidence, p.quality, p.source]);
    prev = p;
  }
  return { v: 2, epoch, first, rows };
}

export function decodeTrustedDelta(encoded: DeltaHistory): HistoryPoint[] {
  if (encoded.v !== 2 || encoded.first === null) return [];
  const f = encoded.first, ff = fromFlags(f[9]);
  let prev: HistoryPoint = {
    epoch: encoded.epoch, sequence: f[0], wallTimeMs: f[1], trustedLatE7: f[2], trustedLonE7: f[3], uncertaintyCm: f[4], speedCms: f[5], speedAccuracyCms: f[6], bearingCdeg: f[7], batteryPct: f[8], ...ff, activity: f[10], activityConfidence: f[11], quality: f[12], source: f[13]
  };
  const out = [prev];
  for (const r of encoded.rows) {
    let lat: number | null = null, lon: number | null = null;
    if (r[2] === 1) {
      if (prev.trustedLatE7 === null || prev.trustedLonE7 === null || r[3] === null || r[4] === null) throw new Error("invalid coordinate delta");
      lat = prev.trustedLatE7 + r[3]; lon = prev.trustedLonE7 + r[4];
    } else if (r[2] === 2) {
      if (r[3] === null || r[4] === null) throw new Error("invalid absolute coordinate");
      lat = r[3]; lon = r[4];
    } else if (r[2] !== 0) throw new Error("invalid coordinate mode");
    const fl = fromFlags(r[10]);
    const p: HistoryPoint = {
      epoch: encoded.epoch, sequence: prev.sequence + r[0], wallTimeMs: prev.wallTimeMs + r[1], trustedLatE7: lat, trustedLonE7: lon,
      uncertaintyCm: r[5], speedCms: r[6], speedAccuracyCms: r[7], bearingCdeg: r[8], batteryPct: r[9], ...fl,
      activity: r[11], activityConfidence: r[12], quality: r[13], source: r[14]
    };
    out.push(p); prev = p;
  }
  return out;
}

export async function gzipJson(value: unknown): Promise<ArrayBuffer> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const compressed = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(compressed).arrayBuffer();
}

export async function readJsonObject<T>(obj: R2ObjectBody): Promise<T> {
  if (obj.httpMetadata?.contentEncoding === "gzip") {
    const decompressed = obj.body.pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(decompressed).text()) as T;
  }
  return JSON.parse(await obj.text()) as T;
}

export async function sequenceFingerprint(values: number[]): Promise<string> {
  const bytes = new TextEncoder().encode(values.join(","));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest.slice(0, 8), b => b.toString(16).padStart(2, "0")).join("");
}
