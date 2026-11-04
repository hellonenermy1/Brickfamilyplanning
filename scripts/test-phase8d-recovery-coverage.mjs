import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { newDatabase, ecdsa, addDevice, DEVICE_A, DEVICE_B } from "./phase8d-native-fixture.mjs";

const backup = await import(pathToFileURL(process.argv[2]).href);
const restore = await import(pathToFileURL(process.argv[3]).href);
const source = newDatabase(), target = newDatabase();
function d1(db) {
  const statement = (sql, args = []) => ({ sql, args, bind(...values) { return statement(sql, values); },
    async first() { return db.prepare(sql).get(...args) ?? null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: db.prepare(sql).run(...args).changes } }; } });
  return { prepare(sql) { return statement(sql); }, async batch(statements) {
    db.exec("BEGIN IMMEDIATE"); try {
      const results = []; for (const s of statements) results.push(/^SELECT /i.test(s.sql) ? await s.all() : await s.run());
      db.exec("COMMIT"); return results;
    } catch (e) { db.exec("ROLLBACK"); throw e; }
  } };
}
try {
  for (const id of [DEVICE_A, DEVICE_B]) addDevice(source, id, (await ecdsa()).spki);
  const stamp = Date.now();
  source.prepare("INSERT INTO witness_authorizations VALUES(?1,?2,1,?3,?3)").run(DEVICE_A, DEVICE_B, stamp);
  source.prepare("INSERT INTO ground_receivers(id,device_id,name,latitude,longitude,radius_m,public_key_spki_b64,created_at,updated_at) VALUES('receiver-test',?1,'Synthetic',1.35,103.8,50,?2,?3,?3)")
    .run(DEVICE_A, (await ecdsa()).spki, stamp);
  source.prepare("INSERT INTO device_commands(id,device_id,command_type,created_at,expires_at,status) VALUES('pending-test',?1,'synthetic',?2,?3,'pending')").run(DEVICE_A, stamp, stamp + 60_000);
  // Nonempty round-trip for EVERY current snapshot table. Required values follow
  // the real SQLite schema/FKs; this is not an empty-table inventory-only test.
  for (const table of backup.BACKUP_TABLES) {
    if (source.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n) continue;
    const fields = source.prepare(`PRAGMA table_info(${table})`).all().filter(c => c.pk || c.notnull && c.dflt_value === null);
    const value = c => {
      if (c.name === "device_id") return DEVICE_A;
      if (["witness_device_id", "child_device_id"].includes(c.name)) return DEVICE_B;
      if (c.name === "geofence_id") return "geofence-test";
      if (c.name === "receiver_id") return "receiver-test";
      if (c.name === "batch_id") return "batch-test";
      if (c.name === "record_id" || c.name === "source_record_id") return "record-test";
      if (c.name === "alias") return "a".repeat(16);
      if (c.name === "payload_sha256") return "0".repeat(64);
      if (c.name === "id" && c.type !== "INTEGER") return table === "geofences" ? "geofence-test" : table + "-test";
      if (c.name === "command_status" || c.name === "status") return "pending";
      if (c.name === "radius_m") return 50;
      if (c.name === "safety_event_days") return 180;
      if (c.name.endsWith("_json")) return "{}";
      return c.type === "TEXT" ? "synthetic" : 1;
    };
    source.prepare(`INSERT INTO ${table} (${fields.map(c => c.name).join(",")}) VALUES (${fields.map(() => "?").join(",")})`)
      .run(...fields.map(value));
  }
  let stored;
  const snapshot = await backup.snapshotD1ToR2({ DB: d1(source), HISTORY: {
    async put(key, body) { stored = body; return { etag: "synthetic" }; },
    async list() { return { objects: [], truncated: false }; }, async delete() { throw Error("unexpected delete"); }
  } }, stamp);
  const parsed = JSON.parse(gunzipSync(new Uint8Array(stored)).toString("utf8"));
  assert.equal(parsed.tables.witness_authorizations?.length, 1, "required witness authorization lost from actual snapshot");
  assert.equal(parsed.tables.ground_receivers?.length, 1, "required ground receiver lost from actual snapshot");
  assert.equal(parsed.format, "brick-d1-snapshot-v3");
  const result = await restore.restoreBackupToFreshD1({ DB: d1(target) }, stored, snapshot.sha256);
  assert.equal(result.coverageComplete, true);
  assert.equal(target.prepare("SELECT COUNT(*) n FROM witness_authorizations").get().n, 1);
  assert.equal(target.prepare("SELECT COUNT(*) n FROM ground_receivers").get().n, 1);
  assert.equal(target.prepare("SELECT status FROM device_commands").get().status, "expired", "generic pending command revived after recovery");
  assert.equal(target.prepare("PRAGMA foreign_key_check").all().length, 0);
  for (const table of backup.BACKUP_TABLES) {
    assert(parsed.tables[table].length > 0, "empty coverage fixture for " + table);
    assert.equal(target.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, parsed.tables[table].length, "restored row count " + table);
    // Pending command cancellation is the only intended row transformation.
    if (["device_commands", "device_location_control", "device_live_track_control"].includes(table)) continue;
    const normalize = rows => rows.map(row => JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))))).sort();
    assert.deepEqual(normalize(target.prepare(`SELECT * FROM ${table}`).all()), normalize(parsed.tables[table]), "changed recovered fields " + table);
  }
  const declared = new Set(fs.readdirSync("schema").filter(x => x.endsWith(".sql")).flatMap(x =>
    [...fs.readFileSync("schema/" + x, "utf8").matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1])));
  const classes = [...backup.BACKUP_TABLES, ...backup.TRANSIENT_RECOVERY_TABLES, ...backup.DEVELOPMENT_RECOVERY_TABLES];
  assert.equal(classes.length, new Set(classes).size, "overlapping recovery policy classes");
  assert.deepEqual([...new Set(classes)].sort(), [...declared].sort(), "every source table must have an explicit recovery policy");
  console.log("PASS P8D-002 all 48 source tables classified, actual v3 snapshot/restore preserves witness/receiver config, generic pending command retired, FK intact; live R2/DO recovery OPEN");
} finally { source.close(); target.close(); }

// The older mutating Cloudflare drill must reject inventory drift BEFORE creating
// any resource. Synthetic values only; every attempted fetch would fail this test.
const preflight = spawnSync(process.execPath, ["--input-type=module", "-e", `
  import assert from "node:assert/strict";
  process.env.CLOUDFLARE_API_TOKEN = "synthetic-no-network";
  process.env.CLOUDFLARE_ACCOUNT_ID = "synthetic-no-network";
  process.argv[2] = ${JSON.stringify(path.resolve(process.argv[3]))};
  let calls = 0; globalThis.fetch = () => { calls++; throw Error("Unexpected cloud mutation"); };
  await assert.rejects(import(${JSON.stringify(pathToFileURL(path.resolve("scripts/phase8-live-brick-backup-restore.mjs")).href)}), /Legacy 18-table live drill cannot qualify/);
  assert.equal(calls, 0);
`], { encoding: "utf8" });
assert.equal(preflight.status, 0, preflight.stderr);
console.log("PASS legacy live restore drill rejects incomplete inventory before any Cloudflare fetch/resource creation");
