import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { P8B_LOCATION_CONTROL_COLUMNS, stripHandledLocationControlAlters } from "./phase8d-schema-compat.mjs";
const orig = readFileSync("schema/016_p8b_remediation.sql", "utf8");
const transformed = stripHandledLocationControlAlters(orig);
assert.doesNotMatch(transformed,/\bALTER TABLE\b/i);
assert.match(transformed,/CREATE TABLE IF NOT EXISTS device_live_track_control/);
assert.match(transformed,/CREATE TABLE IF NOT EXISTS device_wifi_schedules/);
assert.match(transformed,/CREATE TABLE IF NOT EXISTS device_wifi_schedule_result/);
assert.match(transformed,/CREATE TABLE IF NOT EXISTS device_capability_profile/);
assert.match(transformed,/CREATE TABLE IF NOT EXISTS screen_time_daily/);
assert.match(transformed,/CREATE TABLE IF NOT EXISTS commute_summaries/);
assert.match(transformed,/CREATE TABLE IF NOT EXISTS provider_cache/);
assert.equal(P8B_LOCATION_CONTROL_COLUMNS.length,5);
assert.throws(()=>stripHandledLocationControlAlters(orig.replace("completed_at INTEGER","completed_at TEXT")),/definition drift/);
assert.throws(()=>stripHandledLocationControlAlters(orig.replace("ADD COLUMN completed_at","ADD COLUMN completed_unknown")),/Unexpected migration 016 column/);
assert.throws(()=>stripHandledLocationControlAlters(orig.replace("ALTER TABLE device_location_control ADD COLUMN result_reason TEXT;","")),/Missing migration 016 ALTERs/);
assert.throws(()=>stripHandledLocationControlAlters(orig+"\nALTER TABLE devices ADD COLUMN arbitrary INTEGER;"),/Unreviewed remaining ALTER/);
if (process.argv[2] === "--write-sql") {
  writeFileSync("/tmp/brick-p8d-016-columns.sql",P8B_LOCATION_CONTROL_COLUMNS.map(([name,type]) => `ALTER TABLE device_location_control ADD COLUMN ${name} ${type};`).join("\n") + "\n");
  writeFileSync("/tmp/brick-p8d-016-remainder.sql",transformed);
}
process.stdout.write("PASS phase8d 016 migration transform: five exact ALTERs handled by introspection; no skipped CREATE TABLE/INDEX or unreviewed ALTER\n");
