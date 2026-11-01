import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('usage: test-phase5-parent-live.mjs <parent-v6-module>');
const parent = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);
const html = parent.parentV6Html();

assert.ok(html.includes("const h=x.health,base=x.latest||x.state||null,rr=x.refinedState||null"));
assert.ok(html.includes("bq!=='precise'&&bq!=='assisted'"), 'fresh precise/assisted display must remain primary');
assert.ok(html.includes("external refinement"));
assert.ok(html.includes("refreshPhase5State"));
assert.ok(html.includes("setInterval(()=>refreshPhase5State(id),10000)"));
assert.ok(html.includes("ws.onopen=()=>refreshPhase5State(id)"));
assert.ok(html.includes("Externally refined "));

// The generated script must not contain the known TDZ form where h was declared only after the
// synthesized refined location attempted to read h?.batteryPct.
assert.ok(!html.includes("batteryPct:base?.batteryPct??h?.batteryPct??'—',charging:base?.charging??h?.charging??false}:base,h=x.health"));

const doSource = fs.readFileSync('src/device-do.ts', 'utf8');
assert.ok(doSource.includes('type: "snapshot"'));
assert.ok(doSource.includes('type: "location", state'));
assert.ok(doSource.includes('type: "networkEvidence", networkEvidence: network'));
assert.ok(doSource.includes('type: "safety_event", event: stored'));
assert.ok(doSource.includes('latest: snapshot.latest'));
assert.ok(doSource.includes('state: snapshot.state'));
assert.ok(doSource.includes('server.send(JSON.stringify(snapshot))'));

console.log('PHASE5_PARENT_LIVE_REFINEMENT_PASS');
