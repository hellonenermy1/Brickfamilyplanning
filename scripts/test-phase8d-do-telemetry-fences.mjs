// Actual production-exported DO class; deterministic storage transactions, no cloud.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { deviceState } from './phase8d-do-state-fixture.mjs';
const { BrickDevice } = await import(pathToFileURL(process.argv[2]).href);
const health = n => ({ protocol: 1, healthSequence: n, healthSentAtMs: Date.now(), appVersion: 'synthetic', batteryPct: n });
const network = n => ({ country: 'SG', region: null, city: null, colo: 'SIN', receivedAt: n });
const event = n => ({ id: 'synthetic-' + n, kind: 'sos', deviceCreatedAt: n, serverCreatedAt: n, latitude: null, longitude: null, accuracyM: null, detail: {} });
let failures = 0;
async function check(label, fn) { try { await fn(); console.log('PASS ' + label); } catch(e) { failures++; console.error('FAIL ' + label + ': ' + e.message); } }
async function seed() {
  const ctx = deviceState(), object = new BrickDevice(ctx, {});
  await object.setHealth(health(10)); await object.setNetworkEvidence(network(10)); await object.pushSafetyEvent(event(10));
  await object.commitSequenceHighWater(1,10); await object.commitSafetyEvaluation(1,10); await object.commitSafetyHighWater(10);
  return {ctx,object};
}
for (const reload of [false,true]) await check('P8D-054 revoked ' + (reload ? 'reloaded' : 'resident') + ' DO preserves all six archived state keys', async () => {
  const {ctx,object} = await seed(); await object.revokeParentSockets();
  const before = structuredClone([...ctx.storage.data]); const target = reload ? new BrickDevice(ctx,{}) : object;
  await target.setHealth(health(20)); await target.setNetworkEvidence(network(20)); await target.pushSafetyEvent(event(20));
  await target.commitSequenceHighWater(2,20); await target.commitSafetyEvaluation(2,20); await target.commitSafetyHighWater(20);
  assert.deepEqual([...ctx.storage.data], before);
  assert.equal(await target.canEvaluateSafety(2,20), false, 'revoked DO still permits new safety evaluation');
});
await check('P8D-054 persisted revoke observed after stale constructor memory', async () => {
  const {ctx,object} = await seed(); await object.readSequenceHighWater();
  await ctx.storage.put('wsRevoked',true); const before = structuredClone([...ctx.storage.data]);
  await object.setHealth(health(20)); await object.setNetworkEvidence(network(20)); await object.pushSafetyEvent(event(20));
  await object.commitSequenceHighWater(2,20); await object.commitSafetyEvaluation(2,20); await object.commitSafetyHighWater(20);
  assert.deepEqual([...ctx.storage.data],before);
});
for (const [label,method,key,pair] of [
  ['sequence','commitSequenceHighWater','sequenceHighWater',true],
  ['safety evaluation','commitSafetyEvaluation','safetyEvaluationHighWater',true],
  ['safety event','commitSafetyHighWater','safetyHighWater',false]
]) await check('P8D-055 concurrent ' + label + ' marker never regresses', async () => {
  const ctx=deviceState(), object=new BrickDevice(ctx,{}); const args=n=>pair?[1,n]:[n];
  await object[method](...args(100));
  await Promise.all([object[method](...args(102)),object[method](...args(101))]);
  assert.deepEqual(ctx.storage.data.get(key), pair?{epoch:1,sequence:102}:102);
  if(pair){await Promise.all([object[method](2,1),object[method](1,999)]);assert.deepEqual(ctx.storage.data.get(key),{epoch:2,sequence:1});}
});
await check('P8D-056 delayed duplicate/legacy health cannot replace newer signed sequence',async()=>{
 const {ctx,object}=await seed();await object.setHealth(health(12));const before=structuredClone(ctx.storage.data.get('health'));
 await object.setHealth(health(11));await object.setHealth({...health(12),batteryPct:0});await object.setHealth({protocol:1,appVersion:'legacy'});
 assert.deepEqual(ctx.storage.data.get('health'),before);
});
await check('P8D-056 legacy health accepted before sequence-aware telemetry, active newer update retained',async()=>{
 const ctx=deviceState(),object=new BrickDevice(ctx,{});await object.setHealth({protocol:1,appVersion:'legacy'});
 assert.equal(ctx.storage.data.get('health').appVersion,'legacy');await object.setHealth(health(1));await object.setHealth(health(2));
 assert.equal(ctx.storage.data.get('health').healthSequence,2);
});
if(failures)process.exitCode=1;
