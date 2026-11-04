// Node-only transactional storage fixture; never imported by production.
export function deviceState(seed = {}) {
  const data = new Map(Object.entries(seed));
  let serial = Promise.resolve();
  const storage = {
    data,
    async get(key) { return structuredClone(data.get(key)); },
    async put(key, value) { data.set(key, structuredClone(value)); },
    async transaction(callback) {
      const run = serial.then(async () => {
        const staged = new Map(data);
        const result = await callback({
          async get(key) { return structuredClone(staged.get(key)); },
          async put(key, value) { staged.set(key, structuredClone(value)); }
        });
        data.clear(); for (const [key, value] of staged) data.set(key, value);
        return result;
      });
      serial = run.catch(() => undefined);
      return run;
    },
    async getAlarm() { return null; },
    async setAlarm() {}
  };
  return { storage, getWebSockets() { return []; }, waitUntil(p) { p.catch(() => undefined); } };
}

export function livePacketBytes(now = Date.now(), sequence = 1) {
  const bytes = new ArrayBuffer(90), v = new DataView(bytes), absent = -2147483648;
  v.setUint8(0, 2); v.setUint32(1, 1); v.setBigUint64(5, BigInt(sequence));
  v.setBigUint64(13, 1000n); v.setBigUint64(21, BigInt(now));
  v.setInt32(29, 13500000); v.setInt32(33, 1038000000); v.setInt32(37, 15000);
  v.setInt32(41, 13500000); v.setInt32(45, 1038000000); v.setInt32(49, 15000);
  for (const offset of [53, 57, 61, 65, 69, 73]) v.setInt32(offset, absent);
  v.setUint8(77, 80); v.setUint16(78, 2); v.setUint8(80, 2); v.setUint8(81, 75);
  v.setUint8(82, 5); v.setUint8(83, 1); v.setUint8(84, 3); v.setUint8(85, 6);
  v.setUint16(86, 450); v.setUint16(88, 0);
  return bytes;
}
