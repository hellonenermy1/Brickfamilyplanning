import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { adapter, ecdsa, addDevice, DEVICE_A } from "./phase8d-native-fixture.mjs";
const { default: worker } = await import(pathToFileURL(process.argv[2]).href);
let failures = 0;
async function check(name, callback) {
  try { await callback(); console.log("PASS " + name); }
  catch (e) { failures++; console.error("FAIL " + name + ": " + e.message); }
}
const setup = fs.readFileSync("scripts/setup-v1-phase6-development-free.mjs", "utf8");
const post = fs.readFileSync("scripts/setup-v1-phase6-development-cardfree-v2.mjs", "utf8");
const base = [...setup.match(/const SCHEMAS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+\.sql)'/g)].map(x => x[1]);
const oldPost = [...post.matchAll(/'(schema\/01[45][^']+\.sql)'/g)].map(x => x[1]);
const db = new DatabaseSync(":memory:");
try {
  const { stripHandledLocationControlAlters, P8B_LOCATION_CONTROL_COLUMNS } = await import("./phase8d-schema-compat.mjs");
  for (const path of [...new Set([...base, ...oldPost])]) {
    const sql = fs.readFileSync(path, "utf8");
    if (path.includes("016_")) {
      for (const [name, type] of P8B_LOCATION_CONTROL_COLUMNS) db.exec(`ALTER TABLE device_location_control ADD COLUMN ${name} ${type}`);
      db.exec(stripHandledLocationControlAlters(sql));
    } else db.exec(sql);
  }
  await check("P8D-051 fresh configured dev migration path contains production control/summary/PIN schema", async () => {
    const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name));
    for (const name of ["device_live_track_control", "device_wifi_schedules", "screen_time_daily", "commute_summaries", "provider_rate_window", "pairing_pin_sessions"])
      assert(names.has(name), "development provisioning omitted " + name);
    assert(db.prepare("PRAGMA table_info(device_location_control)").all().some(x => x.name === "command_status"));
  });
  const key = await ecdsa(); addDevice(db, DEVICE_A, key.spki);
  const cookie = "test_session_not_a_real_credential";
  db.prepare("INSERT INTO dev_parent_sessions(session_hash,created_at,expires_at) VALUES(?1,?2,?3)")
    .run(createHash("sha256").update(cookie).digest("hex"), Date.now(), Date.now() + 60_000);
  const rate = { async limit() { return { success: true }; } };
  const env = { APP_ENV: "development", DEV_PARENT_AUTH_MODE: "d1-session-v1", DB: adapter(db),
    BRICK_MAP_SOURCE: "https://maps.invalid/test.pmtiles", DEVICE_RATE: rate, PAIR_RATE: rate,
    PARENT_HISTORY_RATE: rate, PARENT_WS_RATE: rate, PARENT_GEOCODE_RATE: rate, PARENT_COMMUTE_RATE: rate };
  const pending = [], ctx = { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => undefined)); } };
  await check("P8D-051 actual dev entry reaches signed screen-time overlay route", async () => {
    const req = await key.signed("https://brick.invalid/api/device/" + DEVICE_A + "/screen-time", {
      protocol: 1, localDay: "2026-11-04", totalForegroundMs: 1000, sessionCount: 1,
      capturedAtMs: Date.now(), privacy: "aggregate_only_no_package_names"
    });
    const response = await worker.fetch(req, env, ctx);
    assert.equal(response.status, 200, "dev entry failed the production overlay route");
  });
  await check("P8D-051 authenticated dev parent can read screen-time overlay", async () => {
    const req = new Request("https://brick.invalid/parent/api/device/" + DEVICE_A + "/screen-time", {
      headers: { Cookie: "brick_parent_dev=" + cookie }
    });
    const response = await worker.fetch(req, env, ctx);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).days.length, 1);
  });
  await check("P8D-051 dev page renders current overlay and preserves development auth", async () => {
    const req = new Request("https://brick.invalid/parent", { headers: { Cookie: "brick_parent_dev=" + cookie } });
    const response = await worker.fetch(req, env, ctx);
    assert.equal(response.status, 200);
    assert((await response.text()).includes("p8bRecenter"), "current dev overlay missing Recenter control");
    assert.equal(response.headers.get("X-Brick-Environment"), "development");
  });
  await Promise.all(pending);
} finally { db.close(); }
if (failures) process.exitCode = 1;
