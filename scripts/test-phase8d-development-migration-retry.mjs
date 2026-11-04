import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { applyDevelopmentSchema16, revokePriorDevelopmentSessions } from "./phase8d-development-schema16.mjs";
const db = new DatabaseSync(":memory:");
try {
  db.exec(fs.readFileSync("schema/001_init.sql", "utf8"));
  db.exec(fs.readFileSync("schema/011_v1_phase6_location_control.sql", "utf8"));
  db.exec(fs.readFileSync("schema/012_phase6c_free_runtime.sql", "utf8"));
  let writes = 0, interrupted = false;
  const source = fs.readFileSync("schema/016_p8b_remediation.sql", "utf8");
  const options = {
    source,
    async columns() { return db.prepare("PRAGMA table_info(device_location_control)").all().map(x => x.name); },
    async execute(sql) {
      db.exec(sql); writes++;
      if (!interrupted && writes === 2) { interrupted = true; throw Error("synthetic interruption after committed ADD COLUMN"); }
    },
    async applyRemainder(sql) { db.exec(sql); }
  };
  await assert.rejects(() => applyDevelopmentSchema16(options), /synthetic interruption/);
  await applyDevelopmentSchema16(options);
  const after = writes;
  await applyDevelopmentSchema16(options);
  assert.equal(writes, after, "repeat migration should not issue duplicate ALTER");
  assert.equal(db.prepare("PRAGMA table_info(device_location_control)").all().filter(x => ["command_status", "completed_at", "result_actual_enabled", "result_success", "result_reason"].includes(x.name)).length, 5);
  assert(db.prepare("SELECT name FROM sqlite_master WHERE name='device_wifi_schedules'").get());
  await assert.rejects(() => applyDevelopmentSchema16({ ...options, source: source + "\nALTER TABLE unexpected ADD COLUMN x TEXT;" }), /Unreviewed remaining ALTER/);
  assert.equal(writes, after, "drift should fail before mutation");
  const insert = db.prepare("INSERT INTO dev_parent_sessions VALUES(?1,1,999999,?2)");
  insert.run("a".repeat(64), null); insert.run("b".repeat(64), 10);
  await revokePriorDevelopmentSessions(async (sql, args) => db.prepare(sql).run(...args), 100);
  assert.deepEqual(db.prepare("SELECT revoked_at FROM dev_parent_sessions ORDER BY session_hash").all().map(x => x.revoked_at), [100, 10]);
  console.log("PASS P8D-051 interrupted/repeated schema16, drift-before-write rejection and old-session revocation on native SQLite");
} finally { db.close(); }
