import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { newDatabase, adapter, ecdsa, addDevice, DEVICE_A } from "./phase8d-native-fixture.mjs";
import { deviceState, livePacketBytes } from "./phase8d-do-state-fixture.mjs";

const { default: worker, BrickDevice } = await import(pathToFileURL(process.argv[2]).href);
let failed = 0;
async function check(name, callback) {
  try { await callback(); console.log("PASS " + name); }
  catch (error) { failed++; console.error("FAIL " + name + ": " + error.message); }
}
async function fixture({ revokeAtRead = false, revokedDO = false, rejectDO = false } = {}) {
  const db = newDatabase(), key = await ecdsa(); addDevice(db, DEVICE_A, key.spki);
  const state = deviceState(revokedDO ? { wsRevoked: true } : {});
  const actual = new BrickDevice(state, {});
  let reads = 0, calls = 0;
  const env = {
    DB: adapter(db, (sql) => {
      if (sql.includes("SELECT public_key_spki_b64,revoked_at FROM devices")) {
        reads++;
        if (revokeAtRead && reads === 1) db.prepare("UPDATE devices SET revoked_at=?1 WHERE id=?2").run(Date.now(), DEVICE_A);
      }
    }),
    MAPS: {}, DEVICE_RATE: { async limit() { return { success: true }; } },
    BRICK_DEVICE: { idFromName(id) { return id; }, get() {
      return { async setLatestWithTrace(...args) {
        calls++; if (rejectDO) throw Error("synthetic DO outage");
        return actual.setLatestWithTrace(...args);
      } };
    } }
  };
  const bytes = livePacketBytes();
  const signature = Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.pair.privateKey, bytes)).toString("base64");
  const request = () => new Request("https://brick.invalid/api/device/" + DEVICE_A + "/location/live", {
    method: "POST", headers: { "X-Brick-Signature": signature }, body: bytes.slice(0)
  });
  return { db, state, actual, env, request, get calls() { return calls; } };
}

await check("P8D-050 actual outer production route permits active signed Fast Live", async () => {
  const f = await fixture(); try {
    const response = await worker.fetch(f.request(), f.env, { waitUntil() {} });
    assert.equal(response.status, 200); assert.equal((await response.json()).previewed, true);
    assert.equal(f.state.storage.data.get("latest").sequence, 1);
  } finally { f.db.close(); }
});
await check("P8D-050 actual outer route rechecks D1 after stale authorization", async () => {
  const f = await fixture({ revokeAtRead: true }); try {
    const response = await worker.fetch(f.request(), f.env, { waitUntil() {} });
    assert.equal(response.status, 401, "revoked Fast Live request was accepted");
    assert.equal(f.calls, 0, "revoked Fast Live reached DO");
    assert.equal(f.state.storage.data.has("latest"), false);
  } finally { f.db.close(); }
});
await check("P8D-050 persistent DO fence denies an otherwise active D1 route", async () => {
  const f = await fixture({ revokedDO: true }); try {
    const response = await worker.fetch(f.request(), f.env, { waitUntil() {} });
    assert.equal(response.status, 401, "DO-revoked Fast Live was falsely accepted");
    assert.equal(f.state.storage.data.has("latest"), false);
  } finally { f.db.close(); }
});
await check("P8D-050 both latest RPC methods preserve archived state after revoke/reload", async () => {
  const f = await fixture(); try {
    await worker.fetch(f.request(), f.env, { waitUntil() {} });
    const before = structuredClone(f.state.storage.data.get("latest"));
    await f.actual.revokeParentSockets();
    const packet = { version: 2, epoch: 2, sequence: 2, wallTimeMs: Date.now() + 1000,
      trustedLatE7: 13500000, trustedLonE7: 1038000000, uncertaintyCm: 15000 };
    assert.equal(await f.actual.setLatest(packet), false, "revoked setLatest changed archive");
    const reloaded = new BrickDevice(f.state, {});
    const result = await reloaded.setLatestWithTrace(packet, { id: "synthetic", backendReceivedAtMs: Date.now() });
    assert.equal(result.revoked, true);
    assert.deepEqual(f.state.storage.data.get("latest"), before);
  } finally { f.db.close(); }
});
await check("P8D-050 DO outage returns retryable HTTP, no false preview", async () => {
  const f = await fixture({ rejectDO: true }); try {
    const response = await worker.fetch(f.request(), f.env, { waitUntil() {} });
    assert.equal(response.status, 503);
    assert.equal(f.state.storage.data.has("latest"), false);
  } finally { f.db.close(); }
});
if (failed) process.exitCode = 1;
