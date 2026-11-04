#!/usr/bin/env node
/**
 * Phase 8D no-cloud-secrets audit gates. These deliberately fail on an incompatible
 * production deployment or incomplete logical backup. No mutations or network calls.
 * Source evidence is not a substitute for a live Cloudflare deployment comparison.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = path => readFileSync(join(process.cwd(), path), "utf8");
const cfg = JSON.parse(read("wrangler.template.jsonc"));
const setup = read("scripts/setup-v1-phase6.mjs");
const fin = read("scripts/setup-v1-phase8-finalize.mjs");
const verify = read("scripts/verify-cloudflare-deployment.mjs");
const workflow = read(".github/workflows/deploy-brick.yml");
const backup = read("src/backup-v6.ts");
const restore = read("src/backup-restore-v6.ts");
const liveDrill = read("scripts/phase8-live-brick-backup-restore.mjs");
const requiredProdP8B = ["schema/015_phase8_device_identity.sql","schema/016_p8b_remediation.sql","schema/017_p8b_provider_rate.sql","schema/018_p8b_pin_pairing.sql"];
function unquoteArray(body,name) {
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const match=body.match(new RegExp("const\\s+"+escaped+"\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*(?:as const)?\\s*;"));
  assert.ok(match, "cannot extract "+name+" array");
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map(m=>m[1]);
}
function collect(checks) {
  let failure = 0;
  for (const [name,fn] of checks) {
    try { fn(); process.stdout.write("PASS "+name+"\n"); }
    catch (e) { failure++; process.stderr.write("FAIL "+name+": "+String(e?.message||e)+"\n"); }
  }
  return failure;
}
const deploy = [
  ["production template is explicit Worker entry",()=>{
    assert.equal(cfg.main,"src/worker-p8b.ts");assert.equal(cfg.vars?.APP_ENV,"production");assert.equal(cfg.vars?.CURRENT_APP_VERSION,"1.0.0-rc.1");
  }],
  ["production setup accepts actual Worker entry",()=>assert.ok(setup.includes('template.includes(\'"main": "src/worker-p8b.ts"\')'),"setup rejects current Worker entry")],
  ["setup includes required P8B production SQL",()=>{const schema=unquoteArray(setup,"SCHEMAS");for(const p of requiredProdP8B)assert.ok(schema.includes(p),"missing setup migration "+p);}],
  ["finalization tracks actual Worker",()=>assert.match(fin,/state\.workerEntry\s*!==\s*['"]src\/worker-p8b\.ts['"]/)],
  ["Cloudflare verification expects actual Worker",()=>assert.match(verify,/EXPECTED_WORKER_ENTRY\s*=\s*['"]src\/worker-p8b\.ts['"]/)],
  ["Cloudflare verification expects version 1.0.0-rc.1",()=>assert.match(verify,/EXPECTED_RELEASE\s*=\s*['"]1\.0\.0-rc\.1['"]/)],
  ["Cloudflare verification checks schema 018",()=>assert.match(verify,/EXPECTED_SCHEMA_VERSION\s*=\s*18\s*;/)],
  ["production deploy workflow inspects actual Worker",()=>assert.ok(workflow.includes('\"main\": \"src/worker-p8b.ts\"'),"workflow still checks stale Worker entry")],
  ["production deploy workflow requires schema 018",()=>assert.ok(workflow.includes("schema/018_p8b_pin_pairing.sql"),"workflow still checks old migration set")],
  ["production deploy workflow cannot deploy from obsolete branch",()=>assert.ok(!workflow.includes('= "v1-p8-cloud-hardening"'),"workflow hard-requires obsolete pre-P8B branch")],
];
const essentialTables=["devices","device_location_control","geofences","geofence_state","ble_anchors","trips","retention_settings","safety_events","health_incidents","crash_reports","audit_log","device_replay_state","device_live_track_control","device_wifi_schedules","device_wifi_schedule_result","device_capability_profile","screen_time_daily","commute_summaries","witness_authorizations","ground_receivers","evidence_records","device_commands","phase5_refined_intervals"];
const backups=[
  ["D1 backup includes all essential P8B state tables",()=>{const names=unquoteArray(backup,"BACKUP_TABLES");for(const name of essentialTables)assert.ok(names.includes(name),"missing backup table "+name);}],
  ["D1 restore order includes all essential P8B state tables",()=>{const names=unquoteArray(restore,"RESTORE_ORDER");for(const name of essentialTables)assert.ok(names.includes(name),"missing restore table "+name);}],
  ["isolated destructive restore drill includes 016/017/018",()=>{const names=unquoteArray(liveDrill,"SCHEMAS");for(const name of requiredProdP8B)assert.ok(names.includes(name),"missing drill migration "+name);}],
  ["P8B ephemeral tables are not restored as active credentials",()=>{const names=unquoteArray(backup,"BACKUP_TABLES");for(const name of ["pairing_pin_sessions","provider_rate_window"])assert.ok(!names.includes(name),"transient credential/rate table must not be restored: "+name);}],
];
const mode=process.argv[2]??"all";
if(!["all","deployment","backup"].includes(mode)){process.stderr.write("Usage: node scripts/audit-phase8d-contract.mjs [all|deployment|backup]\n");process.exit(2);}
const failures=collect(mode==="deployment"?deploy:mode==="backup"?backups:[...deploy,...backups]);
process.stdout.write(`Phase8D ${mode}: ${failures===0?"PASS":"FAIL"} (${failures} failed checks)\n`);
process.exitCode=failures?1:0;
