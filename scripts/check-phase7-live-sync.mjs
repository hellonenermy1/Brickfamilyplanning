import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

await build({entryPoints:['src/parent-v7-live.ts'],bundle:true,platform:'node',format:'esm',outfile:'/tmp/brick-parent-v7-live.mjs',logLevel:'silent'});
const parent = await import(pathToFileURL('/tmp/brick-parent-v7-live.mjs').href + `?v=${Date.now()}`);
const html = parent.parentV7LiveHtml();
for (const required of ['p7HealthPresentationMatches','p7ScheduleNormalizedStateRefresh','snapshot.healthPresentation=null']) {
  assert.ok(html.includes(required), `missing live health sync contract: ${required}`);
}
assert.ok(html.includes("q==='precise'||q==='assisted'?'CIRCLE'"), 'live fallback must reserve exact circle geometry for precise/assisted quality');
assert.ok(html.includes("q==='estimated'||q==='coarse'?'AREA':'NONE'"), 'unrecognized/unknown live quality must fall back to NONE rather than an exact point');
assert.ok(!html.includes("q==='estimated'||q==='coarse'?'AREA':'CIRCLE'"), 'unsafe unknown-to-circle live fallback must not return');

await build({entryPoints:['src/phase7-state-v2.ts'],bundle:true,platform:'node',format:'esm',outfile:'/tmp/brick-phase7-state-v2.mjs',logLevel:'silent'});
const state = await import(pathToFileURL('/tmp/brick-phase7-state-v2.mjs').href + `?v=${Date.now()}`);

{
  const response = new Response(JSON.stringify({
    latest:{epoch:1,sequence:1,lat:1.3,lon:103.8,uncertaintyM:15,quality:'precise',source:'fused',receivedAt:1_999_999_999_000,wallTimeMs:1_999_999_999_000},
    health:{healthSequence:5,receivedAt:2_000_000_000_000,operationalStatus:'healthy',serviceActive:true,journalWriteHealthy:true,safetyOutboxWriteHealthy:true,network:'wifi',locationEnabled:true,locationSubscribed:true,fineLocationPermission:true,backgroundLocationPermission:true,locationAgeMs:1000,atlasRttProviderHealth:'unsupported'},
    derived:{deviceStatus:'healthy',positionStatus:'fresh'}
  }),{headers:{'content-type':'application/json'}});
  const out = await state.augmentPhase7ParentStateResponseV2(response,2_000_000_000_000);
  const body = await out.json();
  assert.equal(body.healthPresentation.providers.find(p=>p.id==='wifi_rtt')?.status,'unsupported');
  assert.match(body.healthPresentation.providers.find(p=>p.id==='wifi_rtt')?.explanation,/neutral/i);
}

{
  const response = new Response(JSON.stringify({
    latest:{epoch:2,sequence:9,lat:1.301,lon:103.801,uncertaintyM:20,quality:'future_quality_token',source:'fused',receivedAt:1_999_999_999_000,wallTimeMs:1_999_999_999_000},
    health:{healthSequence:6,receivedAt:2_000_000_000_000,operationalStatus:'healthy',serviceActive:true,journalWriteHealthy:true,safetyOutboxWriteHealthy:true,network:'wifi',locationEnabled:true,locationSubscribed:true,fineLocationPermission:true,backgroundLocationPermission:true,locationAgeMs:1000},
    derived:{deviceStatus:'healthy',positionStatus:'fresh'}
  }),{headers:{'content-type':'application/json'}});
  const out = await state.augmentPhase7ParentStateResponseV2(response,2_000_000_000_000);
  const body = await out.json();
  assert.equal(body.presentation.positionClass,'unknown');
  assert.equal(body.presentation.geometry.kind,'NONE');
  assert.equal(body.presentation.geometry.latitude,null);
  assert.equal(body.presentation.geometry.longitude,null);
  assert.equal(body.healthPresentation.position.status,'unavailable');
}

{
  const response = new Response(JSON.stringify({
    latest:{epoch:3,sequence:4,lat:1.31,lon:103.81,uncertaintyM:500,quality:'coarse',source:'fusion',receivedAt:1_999_999_998_000,wallTimeMs:1_999_999_998_000},
    refinedState:{latitude:1.4,longitude:103.9,uncertaintyM:50,quality:'future_quality_token',shape:'possible_area',evidenceUsed:[{id:'future',kind:'witness',ageMs:1000,radiusM:50}]},
    derived:{deviceStatus:'healthy',positionStatus:'fresh'}
  }),{headers:{'content-type':'application/json'}});
  const out = await state.augmentPhase7ParentStateResponseV2(response,2_000_000_000_000);
  const body = await out.json();
  assert.equal(body.presentation.positionClass,'coarse');
  assert.equal(body.presentation.source,'fusion');
  assert.equal(body.presentation.geometry.kind,'AREA');
  assert.equal(body.presentation.geometry.latitude,1.31);
  assert.equal(body.presentation.geometry.longitude,103.81);
}

console.log('Phase 7 live-sync/provider/unknown-quality hardening fixtures: PASS');
