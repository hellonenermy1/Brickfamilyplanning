export const LIVE_PACKET_VERSION_V1 = 1;
export const LIVE_PACKET_VERSION_V2 = 2;
export const V1_BYTES = 43;
export const V2_BYTES = 90;
const MISSING = -2147483648;

export type LivePacket = {
  version: number;
  epoch: number;
  sequence: number;
  elapsedRealtimeMs: number;
  wallTimeMs: number;
  rawLatE7: number | null;
  rawLonE7: number | null;
  rawAccuracyCm: number | null;
  trustedLatE7: number | null;
  trustedLonE7: number | null;
  uncertaintyCm: number;
  speedCms: number | null;
  speedAccuracyCms: number | null;
  bearingCdeg: number | null;
  bearingAccuracyCdeg: number | null;
  altitudeCm: number | null;
  verticalAccuracyCm: number | null;
  batteryPct: number;
  charging: boolean;
  rawAccepted: boolean;
  rawMock: boolean;
  fallback: boolean;
  activity: number;
  activityConfidence: number;
  quality: number;
  source: number;
  gnssUsedInFix: number;
  gnssTotal: number;
  gnssAverageCn0Tenth: number;
  stepDelta: number;
};

export function decodeLivePacket(buf: ArrayBuffer): LivePacket {
  const view = new DataView(buf);
  if (buf.byteLength < 1) throw new Error("empty packet");
  const version = view.getUint8(0);
  if (version === LIVE_PACKET_VERSION_V1) return decodeV1(view);
  if (version === LIVE_PACKET_VERSION_V2) return decodeV2(view);
  throw new Error(`unsupported packet version ${version}`);
}

function safeUint64(v: DataView, offset: number, field: string): number {
  const n = v.getBigUint64(offset, false);
  if (n > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${field} exceeds safe integer range`);
  return Number(n);
}

function decodeV1(v: DataView): LivePacket {
  if (v.byteLength !== V1_BYTES) throw new Error(`bad v1 packet length ${v.byteLength}`);
  let o = 1;
  const epoch = v.getUint32(o, false); o += 4;
  const sequence = safeUint64(v, o, "sequence"); o += 8;
  const elapsedRealtimeMs = safeUint64(v, o, "elapsed realtime"); o += 8;
  const wallTimeMs = safeUint64(v, o, "wall time"); o += 8;
  const latE7 = v.getInt32(o, false); o += 4;
  const lonE7 = v.getInt32(o, false); o += 4;
  const accuracyCm = v.getUint32(o, false); o += 4;
  const batteryPct = v.getUint8(o); o += 1;
  const flags = v.getUint8(o);
  if (sequence <= 0 || elapsedRealtimeMs <= 0 || wallTimeMs <= 0) throw new Error("bad v1 ordering fields");
  validateCoordinate(latE7, lonE7);
  if (batteryPct > 100) throw new Error("bad battery");
  if (accuracyCm > 10_000_000) throw new Error("bad accuracy");
  if ((flags & ~0x01) !== 0) throw new Error("unknown v1 flags");
  return {
    version: 1, epoch, sequence, elapsedRealtimeMs, wallTimeMs,
    rawLatE7: latE7, rawLonE7: lonE7, rawAccuracyCm: accuracyCm,
    trustedLatE7: latE7, trustedLonE7: lonE7, uncertaintyCm: accuracyCm,
    speedCms: null, speedAccuracyCms: null, bearingCdeg: null, bearingAccuracyCdeg: null,
    altitudeCm: null, verticalAccuracyCm: null,
    batteryPct, charging: (flags & 1) !== 0, rawAccepted: true, rawMock: false, fallback: false,
    activity: 0, activityConfidence: 0, quality: accuracyCm <= 2_000 ? 1 : accuracyCm <= 10_000 ? 2 : 5,
    source: 1, gnssUsedInFix: 0, gnssTotal: 0, gnssAverageCn0Tenth: 0, stepDelta: 0
  };
}

function decodeV2(v: DataView): LivePacket {
  if (v.byteLength !== V2_BYTES) throw new Error(`bad v2 packet length ${v.byteLength}`);
  let o = 1;
  const epoch = v.getUint32(o, false); o += 4;
  const sequence = safeUint64(v, o, "sequence"); o += 8;
  const elapsedRealtimeMs = safeUint64(v, o, "elapsed realtime"); o += 8;
  const wallTimeMs = safeUint64(v, o, "wall time"); o += 8;
  const rawLatE7 = nullableInt(v.getInt32(o, false)); o += 4;
  const rawLonE7 = nullableInt(v.getInt32(o, false)); o += 4;
  const rawAccuracyCm = nullableInt(v.getInt32(o, false)); o += 4;
  const trustedLatE7 = nullableInt(v.getInt32(o, false)); o += 4;
  const trustedLonE7 = nullableInt(v.getInt32(o, false)); o += 4;
  const uncertaintyCm = v.getInt32(o, false); o += 4;
  const speedCms = nullableInt(v.getInt32(o, false)); o += 4;
  const speedAccuracyCms = nullableInt(v.getInt32(o, false)); o += 4;
  const bearingCdeg = nullableInt(v.getInt32(o, false)); o += 4;
  const bearingAccuracyCdeg = nullableInt(v.getInt32(o, false)); o += 4;
  const altitudeCm = nullableInt(v.getInt32(o, false)); o += 4;
  const verticalAccuracyCm = nullableInt(v.getInt32(o, false)); o += 4;
  const batteryPct = v.getUint8(o); o += 1;
  const flags = v.getUint16(o, false); o += 2;
  const activity = v.getUint8(o); o += 1;
  const activityConfidence = v.getUint8(o); o += 1;
  const quality = v.getUint8(o); o += 1;
  const source = v.getUint8(o); o += 1;
  const gnssUsedInFix = v.getUint8(o); o += 1;
  const gnssTotal = v.getUint8(o); o += 1;
  const gnssAverageCn0Tenth = v.getUint16(o, false); o += 2;
  const stepDelta = v.getUint16(o, false);

  if (sequence <= 0 || elapsedRealtimeMs <= 0 || wallTimeMs <= 0) throw new Error("bad ordering fields");
  if ((flags & ~0x7f) !== 0) throw new Error("unknown packet flags");
  if ((rawLatE7 === null) !== (rawLonE7 === null)) throw new Error("partial raw coordinate");
  if ((trustedLatE7 === null) !== (trustedLonE7 === null)) throw new Error("partial trusted coordinate");
  if (rawLatE7 !== null && rawLonE7 !== null) validateCoordinate(rawLatE7, rawLonE7);
  if (trustedLatE7 !== null && trustedLonE7 !== null) validateCoordinate(trustedLatE7, trustedLonE7);
  if (rawAccuracyCm !== null && (rawAccuracyCm < 0 || rawAccuracyCm > 50_000_000)) throw new Error("bad raw accuracy");
  if (uncertaintyCm < 0 || uncertaintyCm > 50_000_000) throw new Error("bad uncertainty");
  if (speedCms !== null && (speedCms < 0 || speedCms > 20_000)) throw new Error("bad speed");
  if (speedAccuracyCms !== null && (speedAccuracyCms < 0 || speedAccuracyCms > 20_000)) throw new Error("bad speed accuracy");
  if (bearingCdeg !== null && (bearingCdeg < 0 || bearingCdeg >= 36_000)) throw new Error("bad bearing");
  if (bearingAccuracyCdeg !== null && (bearingAccuracyCdeg < 0 || bearingAccuracyCdeg > 36_000)) throw new Error("bad bearing accuracy");
  if (altitudeCm !== null && (altitudeCm < -2_000_000 || altitudeCm > 10_000_000)) throw new Error("bad altitude");
  if (verticalAccuracyCm !== null && (verticalAccuracyCm < 0 || verticalAccuracyCm > 10_000_000)) throw new Error("bad vertical accuracy");
  if (batteryPct > 100) throw new Error("bad battery");
  if (activity > 5) throw new Error("bad activity");
  if (activityConfidence > 100) throw new Error("bad activity confidence");
  if (quality < 1 || quality > 7) throw new Error("bad quality");
  // Android-origin packets may only claim sources it can directly produce. Source 4
  // (route_constrained) is a server-only trusted refinement applied after signature verification.
  if (source > 3) throw new Error("bad source");
  if (gnssUsedInFix > gnssTotal) throw new Error("bad GNSS satellite counts");
  if (gnssAverageCn0Tenth > 1000) throw new Error("bad GNSS C/N0");
  if ((flags & 0x04) !== 0 && (flags & 0x02) !== 0) throw new Error("mock fix cannot be accepted");
  if ((flags & 0x02) !== 0 && (trustedLatE7 === null || trustedLonE7 === null)) throw new Error("accepted raw fix missing trusted coordinate");
  if (source === 1 && (flags & 0x40) !== 0) throw new Error("fused source cannot be marked fallback");
  if (source !== 1 && (flags & 0x40) === 0) throw new Error("fallback source missing fallback flag");

  return {
    version: 2, epoch, sequence, elapsedRealtimeMs, wallTimeMs,
    rawLatE7, rawLonE7, rawAccuracyCm,
    trustedLatE7, trustedLonE7, uncertaintyCm,
    speedCms, speedAccuracyCms, bearingCdeg, bearingAccuracyCdeg,
    altitudeCm, verticalAccuracyCm,
    batteryPct,
    charging: (flags & 0x01) !== 0,
    rawAccepted: (flags & 0x02) !== 0,
    rawMock: (flags & 0x04) !== 0,
    fallback: (flags & 0x40) !== 0,
    activity, activityConfidence, quality, source,
    gnssUsedInFix, gnssTotal, gnssAverageCn0Tenth, stepDelta
  };
}

function nullableInt(value: number): number | null { return value === MISSING ? null : value; }

function validateCoordinate(latE7: number, lonE7: number) {
  if (latE7 < -900000000 || latE7 > 900000000) throw new Error("bad latitude");
  if (lonE7 < -1800000000 || lonE7 > 1800000000) throw new Error("bad longitude");
}

export function activityName(code: number): string {
  return ["unknown", "stationary", "walking", "running", "bicycle", "vehicle"][code] ?? "unknown";
}

export function qualityName(code: number): string {
  return ["unknown", "precise", "assisted", "anchored", "estimated", "coarse", "last_known", "unknown"][code] ?? "unknown";
}

export function sourceName(code: number): string {
  return ["unknown", "fused", "inertial", "last_known", "route_constrained"][code] ?? "unknown";
}
