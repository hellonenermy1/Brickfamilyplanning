export const LIVE_PACKET_VERSION = 1;

export type LivePacket = {
  version: number;
  epoch: number;
  sequence: number;
  elapsedRealtimeMs: number;
  wallTimeMs: number;
  latE7: number;
  lonE7: number;
  accuracyCm: number;
  batteryPct: number;
  charging: boolean;
};

// Phase 1 binary wire layout (big endian):
// u8 version | u32 epoch | u64 seq | u64 elapsedMs | u64 wallMs |
// i32 latE7 | i32 lonE7 | u32 accuracyCm | u8 battery | u8 flags
// Total = 43 bytes before signature/header metadata.
export function decodeLivePacket(buf: ArrayBuffer): LivePacket {
  if (buf.byteLength !== 43) throw new Error(`bad packet length ${buf.byteLength}`);
  const v = new DataView(buf);
  let o = 0;
  const version = v.getUint8(o); o += 1;
  const epoch = v.getUint32(o, false); o += 4;
  const sequence = Number(v.getBigUint64(o, false)); o += 8;
  const elapsedRealtimeMs = Number(v.getBigUint64(o, false)); o += 8;
  const wallTimeMs = Number(v.getBigUint64(o, false)); o += 8;
  const latE7 = v.getInt32(o, false); o += 4;
  const lonE7 = v.getInt32(o, false); o += 4;
  const accuracyCm = v.getUint32(o, false); o += 4;
  const batteryPct = v.getUint8(o); o += 1;
  const flags = v.getUint8(o);

  if (version !== LIVE_PACKET_VERSION) throw new Error("unsupported packet version");
  if (latE7 < -900000000 || latE7 > 900000000) throw new Error("bad latitude");
  if (lonE7 < -1800000000 || lonE7 > 1800000000) throw new Error("bad longitude");
  if (batteryPct > 100) throw new Error("bad battery");
  if (accuracyCm > 10_000_000) throw new Error("bad accuracy");

  return { version, epoch, sequence, elapsedRealtimeMs, wallTimeMs, latE7, lonE7, accuracyCm, batteryPct, charging: (flags & 1) !== 0 };
}
