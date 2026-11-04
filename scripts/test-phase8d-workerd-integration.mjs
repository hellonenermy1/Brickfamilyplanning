// Real local workerd/Miniflare services. No cloud credentials or remote resources.
// This raises local integration evidence; it is NOT live Cloudflare acceptance.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { newDatabase, ecdsa, DEVICE_A } from "./phase8d-native-fixture.mjs";
import { livePacketBytes } from "./phase8d-do-state-fixture.mjs";

const directory = fs.mkdtempSync(path.resolve(".brick-p8d-workerd-"));
const runtimeFile = path.join(directory, "worker.mjs");
await build({ entryPoints: ["src/worker-p8b.ts"], outfile: runtimeFile, bundle: true, format: "esm", platform: "browser", target: "es2022", external: ["cloudflare:workers"] });
const key = await ecdsa();
const rsa = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...await crypto.subtle.exportKey("jwk", rsa.publicKey), kid: "synthetic", alg: "RS256", use: "sig" };
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
async function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const input = encode({ alg: "RS256", kid: "synthetic", typ: "JWT" }) + "." + encode({ type: "app", aud: ["synthetic-audience"], iss: "https://brick-test.cloudflareaccess.com", iat: now, exp: now + 600 });
  return input + "." + Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", rsa.privateKey, new TextEncoder().encode(input))).toString("base64url");
}
const config = JSON.parse(fs.readFileSync("wrangler.template.jsonc", "utf8"));
const options = convertV4MiniflareOptions({ name: "brick-local", modules: true, modulesRoot: directory, scriptPath: runtimeFile,
  compatibilityDate: config.compatibility_date,
  bindings: { APP_ENV: "production", CURRENT_APP_VERSION: "1.0.0-rc.1", CF_ACCESS_TEAM_DOMAIN: "brick-test.cloudflareaccess.com", CF_ACCESS_AUD: "synthetic-audience" },
  d1Databases: ["DB", "RECOVERY_DB"], r2Buckets: ["HISTORY", "MAPS"],
  durableObjects: { BRICK_DEVICE: { className: "BrickDevice", useSQLite: true } },
  queueProducers: { EVENTS: "brick-family-v1-events" },
  queueConsumers: { "brick-family-v1-events": { maxBatchSize: 10, maxBatchTimeout: 0, maxRetries: 2, deadLetterQueue: "brick-family-v1-dlq" }, "brick-family-v1-dlq": { maxBatchSize: 10, maxBatchTimeout: 0, maxRetries: 2 } },
  ratelimits: Object.fromEntries(config.ratelimits.map(x => [x.name, { namespace_id: x.namespace_id, simple: x.simple }])),
  outboundService(request) {
    if (request.url === "https://brick-test.cloudflareaccess.com/cdn-cgi/access/certs") return Response.json({ keys: [jwk] });
    return new Response("Unconfigured synthetic outbound request", { status: 503 });
  }
});
let mf = new Miniflare(options);
const native = newDatabase();
const ddl = native.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all().map(x => x.sql);
native.close();
async function install(db) { for (const statement of ddl) await db.prepare(statement).run(); }
async function parent(suffix, init = {}) {
  return mf.dispatchFetch("http://localhost" + suffix, { ...init, headers: { "Cf-Access-Jwt-Assertion": await jwt(), Origin: "http://localhost", ...init.headers } });
}
async function signed(sequence, suffix = "/location") {
  const bytes = livePacketBytes(Date.now(), sequence);
  const sig = Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.pair.privateKey, bytes)).toString("base64");
  return mf.dispatchFetch("http://localhost/api/device/" + DEVICE_A + suffix, { method: "POST", headers: { "X-Brick-Signature": sig }, body: bytes });
}
async function until(check, label, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  do { const value = await check(); if (value) return value; await new Promise(r => setTimeout(r, 25)); } while (Date.now() < deadline);
  throw Error("Timed out: " + label);
}
try {
  const db = await mf.getD1Database("DB"), recovery = await mf.getD1Database("RECOVERY_DB");
  await install(db); await install(recovery);
  await db.prepare("INSERT INTO devices(id,name,public_key_spki_b64,created_at) VALUES(?1,'Synthetic',?2,?3)").bind(DEVICE_A, key.spki, Date.now()).run();
  assert.equal((await mf.dispatchFetch("http://localhost/parent/api/devices")).status, 403);
  assert.equal((await signed(1)).status, 200, "native location ingestion failed");
  const bucket = await mf.getR2Bucket("HISTORY");
  const raw = await until(async () => (await bucket.list({ prefix: "history/raw/" })).objects[0], "Queue -> R2 history");
  const rawObject = await bucket.get(raw.key);
  const stored = JSON.parse(gunzipSync(new Uint8Array(await rawObject.arrayBuffer())).toString("utf8"));
  assert.equal(stored.packets[0].sequence, 1);
  assert.equal((await signed(1)).status, 200, "exact signed retry failed");
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM device_events").first()).n, 1);
  const state = await parent("/parent/api/device/" + DEVICE_A + "/state");
  assert.equal(state.status, 200); assert.equal((await state.json()).state.sequence, 1);
  console.log("PASS native workerd production entry: signed D1 -> Queue -> R2 + DO current state, duplicate idempotency, Access denial/valid synthetic JWT");

  const ns = await mf.getDurableObjectNamespace("BRICK_DEVICE"), stub = ns.get(ns.idFromName(DEVICE_A));
  const wsResponse = await stub.fetch("https://do/ws", { headers: { Upgrade: "websocket", "X-Brick-Internal-Ws-Lease-Until": String(Date.now() + 3000) } });
  assert.equal(wsResponse.status, 101); const ws = wsResponse.webSocket; ws.accept();
  let expired = false; ws.addEventListener("close", event => { expired = event.code === 4001; });
  await mf.unsafeEvictDurableObject("brick-local", "BrickDevice", { name: DEVICE_A, webSockets: "hibernate" });
  assert.equal(expired, false, "hibernation must preserve an unexpired socket");
  assert.equal((await parent("/parent/api/device/" + DEVICE_A + "/state")).status, 200);
  await until(() => expired, "real DO idle lease alarm after hibernation/reconstruction", 45_000);
  console.log("PASS native workerd DO WebSocket survives hibernation/reconstruction and expires through idle storage alarm");

  const revoked = await parent("/parent/api/device/" + DEVICE_A + "/revoke", { method: "POST" });
  assert.equal(revoked.status, 200);
  assert.equal((await signed(2, "/location/live")).status, 401);
  const before = (await (await parent("/parent/api/device/" + DEVICE_A + "/state")).json()).state;
  await mf.unsafeEvictDurableObject("brick-local", "BrickDevice", { name: DEVICE_A });
  const fenced = await (await mf.getDurableObjectNamespace("BRICK_DEVICE")).get(ns.idFromName(DEVICE_A)).fetch("https://do/ws", {
    headers: { Upgrade: "websocket", "X-Brick-Internal-Ws-Lease-Until": String(Date.now() + 1000) }
  });
  assert.equal(fenced.status, 410);
  assert.deepEqual((await (await parent("/parent/api/device/" + DEVICE_A + "/state")).json()).state, before);
  console.log("PASS native workerd revoked D1 identity, DO fence reconstruction, archived current state and denied subscription");

  const backupFile = path.join(directory, "backup.mjs"), restoreFile = path.join(directory, "restore.mjs");
  await build({ entryPoints: ["src/backup-v6.ts"], outfile: backupFile, bundle: true, format: "esm", platform: "node" });
  await build({ entryPoints: ["src/backup-restore-v6.ts"], outfile: restoreFile, bundle: true, format: "esm", platform: "node" });
  const { snapshotD1ToR2 } = await import(pathToFileURL(backupFile).href);
  const { restoreBackupToFreshD1 } = await import(pathToFileURL(restoreFile).href);
  const snapshot = await snapshotD1ToR2({ DB: db, HISTORY: bucket });
  const obj = await bucket.get(snapshot.key);
  const result = await restoreBackupToFreshD1({ DB: recovery }, await obj.arrayBuffer(), snapshot.sha256);
  assert.equal(result.coverageComplete, true); assert.equal(Object.keys(result.restoredRows).length, 38);
  assert.equal((await recovery.prepare("SELECT COUNT(*) n FROM device_events").first()).n, 1);
  assert((await recovery.prepare("SELECT revoked_at FROM devices").first()).revoked_at !== null);
  console.log("PASS native workerd D1/R2 actual v3 snapshot and fresh 38-table restore with retained revocation and accepted sequence index; full live DO disaster recovery remains OPEN");
} finally { await mf.dispose(); fs.rmSync(directory, { recursive: true, force: true }); }
