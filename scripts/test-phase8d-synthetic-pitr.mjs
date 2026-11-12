// Offline provider model backed by real SQLite; no token, network or Cloudflare operation.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {syntheticPitrPlan, runSyntheticPitr} from './phase8d-synthetic-pitr.mjs';
import {createHash} from 'node:crypto';
const account = '0'.repeat(32);
// Test-only module copy changes the account digest; production target protections remain intact.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brick-synthetic-pitr-'));
const moduleFile = path.join(dir, 'drill.mjs');
fs.writeFileSync(moduleFile, fs.readFileSync('scripts/phase8d-synthetic-pitr.mjs','utf8').replace(
  'f3596e86fd73a8d069151b0e9fd0e08f6bf5a1518fb3066d1db6daf4f4962a83', createHash('sha256').update(account).digest('hex')).replace('const PROTECTED = new Set([', 'const PROTECTED = new Set([\n  '+JSON.stringify(createHash('sha256').update('33333333-3333-4333-8333-333333333333').digest('hex'))+','));
const {runSyntheticPitr: run, syntheticPitrPlan: planForTest} = await import('file://' + moduleFile);
const input = {accountId: account, sourceSha: 'a'.repeat(40), runId: '20261111-0123456789abcdef', rtoGoalSeconds: 60};
const token = 'offline-synthetic-token-only';
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
function provider(change = () => {}) {
  const databases = new Map(), calls = [];
  let next = 0, point = 0;
  const mark = () => '00000001-00000002-00000003-' + (++point).toString(16).padStart(32, '0');
  const request = async (url, init) => {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : undefined;
    const call = {url, method: init.method, body, index: calls.length + 1, init}; calls.push(call);
    assert.equal(u.origin, 'https://api.cloudflare.com'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.authorization, 'Bearer ' + token);
    const parts = u.pathname.split('/d1/database'), suffix = parts[1];
    assert.equal(parts[0], '/client/v4/accounts/' + account);
    let result;
    if (!suffix) {
      assert.equal(init.method, 'POST'); assert.deepEqual(body.read_replication, {mode:'disabled'});
      const id = '11111111-1111-4111-8111-' + (++next).toString().padStart(12,'0');
      const d = {uuid:id, name:body.name, version:'production', read_replication:{mode:'disabled'},
        db: new DatabaseSync(':memory:'), points: new Map()}; databases.set(id,d);
      result = {...d}; delete result.db; delete result.points;
    } else {
      const [id, operation, sub] = suffix.slice(1).split('/');
      const d = databases.get(id); assert(d, 'only freshly created targets may be accessed');
      if (!operation) { assert.equal(init.method,'GET'); result = {uuid:id,name:d.name,version:d.version,read_replication:d.read_replication}; }
      else if (operation === 'query') {
        assert.equal(init.method,'POST');
        const q = d.db.prepare(body.sql);
        const rows = body.sql.startsWith('SELECT') ? q.all(...body.params).map(row=>({...row})) : (q.run(...body.params), []);
        result = [{success:true, results:rows}];
      } else if (operation === 'time_travel' && sub === 'bookmark') {
        assert.equal(init.method,'GET'); const bookmark = mark();
        d.points.set(bookmark, d.db.prepare('SELECT id,value FROM brick_g1_canary ORDER BY id').all().map(row=>({...row})));
        result = {bookmark};
      } else if (operation === 'time_travel' && sub === 'restore') {
        assert.equal(init.method,'POST'); assert.equal(body,undefined);
        const target = u.searchParams.get('bookmark'); assert(d.points.has(target));
        const previous_bookmark = mark(); d.points.set(previous_bookmark,d.db.prepare('SELECT id,value FROM brick_g1_canary ORDER BY id').all().map(row=>({...row})));
        d.db.exec('DELETE FROM brick_g1_canary');
        for (const row of d.points.get(target)) d.db.prepare('INSERT INTO brick_g1_canary VALUES (?,?)').run(row.id,row.value);
        result = {bookmark:mark(),previous_bookmark};
      } else assert.fail('unreviewed endpoint');
    }
    const state = {call, result, databases, calls, response: null};
    await change(state);
    return state.response ?? new Response(JSON.stringify({success:true,errors:[],messages:[],result:state.result}),{status:200});
  };
  return {request, calls, databases, close(){ for(const d of databases.values()) d.db.close(); }};
}
async function execute(change, options = {}) {
  const p = provider(change);
  try { const result = await run({plan:input,approved:true,token,request:p.request,...options}); return {result,calls:p.calls,databases:[...p.databases.values()].map(d=>({name:d.name,rows:d.db.prepare("SELECT name FROM sqlite_master WHERE name='brick_g1_canary'").all().length ? d.db.prepare('SELECT id,value FROM brick_g1_canary ORDER BY id').all().map(r=>({...r})) : []}))}; }
  finally { p.close(); }
}
try {
  await test('real account pin refuses synthetic account before any request', async()=>{
    assert.throws(()=>syntheticPitrPlan(input),/PLAN_REFUSED/); let called=0;
    await assert.rejects(()=>runSyntheticPitr({plan:input,approved:true,token,request:()=>called++}),/PLAN_REFUSED/); assert.equal(called,0);
  });
  await test('unknown fields and existing-target selection are refused', async()=>{
    for(const bad of [{...input,primaryId:'11111111-1111-4111-8111-000000000001'},{...input,runId:'../../beta'},{...input,rtoGoalSeconds:0},{...input,sourceSha:'HEAD'},{...input,accountId:account.toUpperCase()+'f'}]) assert.throws(()=>planForTest(bad),/PLAN_REFUSED/);
  });
  await test('fresh reviewed November12 plan preserves isolation and older evidence identities',async()=>{
    const p=planForTest({...input,runId:'20261112-f28a8d6cb028d0bb'});assert.deepEqual(p.names,['brick-g1-20261112-f28a8d6cb028d0bb-primary','brick-g1-20261112-f28a8d6cb028d0bb-diagnostics']);assert.equal(p.maximumRequests,44);assert.equal(p.maximumCreates,2);assert.equal(p.maximumRestores,6);assert.equal(p.fullBrickRecoveryQualified,false);
    assert.throws(()=>planForTest({...input,runId:'20261113-f28a8d6cb028d0bb'}),/PLAN_REFUSED/);
  });
  await test('default disarmed invocation has zero requests',async()=>{let calls=0;const r=await run({plan:input,token,request:()=>calls++});assert.equal(r.status,'NOT_EXECUTED');assert.equal(calls,0);});
  await test('missing drill token has zero requests and no fallback',async()=>{const r=await run({plan:input,approved:true,request:()=>assert.fail()});assert.equal(r.code,'OPERATOR_DRILL_TOKEN_REQUIRED');});
  await test('real SQLite two-store restore undo and re-restore verifies every row',async()=>{
    const {result:r,calls,databases}=await execute(); assert.equal(r.status,'SYNTHETIC_SUBGATE_PASSED');assert.equal(r.fullBrickRecoveryQualified,false);
    assert.equal(r.requestsMade,44);assert.equal(calls.filter(c=>c.url.endsWith('/d1/database')).length,2);
    assert.equal(calls.filter(c=>c.url.includes('/restore?')).length,6);assert.equal(r.checkpointRowsLost,0);
    assert(databases.every(d=>d.rows.length===2&&d.rows.every(row=>row.value.includes(':baseline-'))));
    assert(calls.every(c=>c.method!=='DELETE'&&!/workers|r2|queues|billing/.test(c.url)));assert(!JSON.stringify(r).includes(token));
  });
  await test('both checkpoints precede either synthetic corruption',async()=>{const {calls}=await execute();const bookmarks=calls.filter(c=>c.url.endsWith('/bookmark'));const faults=calls.filter(c=>c.body?.sql?.startsWith('UPDATE'));assert.equal(bookmarks.length,2);assert(bookmarks[1].index<faults[0].index);});
  for(const kind of ['name','uuid','version','replication']) await test('metadata '+kind+' drift refuses before canary write',async()=>{
    const {result:r,calls}=await execute(s=>{if(s.call.index===2){if(kind==='name')s.result.name='brick-family-beta';if(kind==='uuid')s.result.uuid='22222222-2222-4222-8222-222222222222';if(kind==='version')s.result.version='alpha';if(kind==='replication')s.result.read_replication={mode:'auto'};}});
    assert.equal(r.code,'TARGET_IDENTITY_REFUSED');assert.equal(calls.length,2);
  });
  for(const kind of ['name','uuid','protected']) await test('invalid creation '+kind+' stops after one create',async()=>{
    const {result:r,calls}=await execute(s=>{if(s.call.index===1){if(kind==='name')s.result.name='brick-family-beta';if(kind==='uuid')s.result.uuid='not-a-uuid';if(kind==='protected')s.result.uuid='33333333-3333-4333-8333-333333333333';}});
    assert.equal(r.code,'CREATED_TARGET_REFUSED');assert.equal(r.status,'MUTATION_OUTCOME_UNKNOWN');assert.equal(calls.length,1);assert.equal(r.plannedNames.length,2);
  });
  await test('intent journal failure refuses before network dispatch',async()=>{
    let called=0;const r=await run({plan:input,approved:true,token,request:()=>called++,record:()=>{throw Error('disk full');}});
    assert.equal(called,0);assert.equal(r.requestsMade,0);assert.equal(r.status,'STOPPED_UNQUALIFIED');assert.equal(r.events[0].mayHaveBeenSent,false);
  });
  await test('lost journal ACK after mutation stops without retry',async()=>{
    const {result:r,calls}=await execute(undefined,{record:e=>{if(e.state==='ENVELOPE_ACKNOWLEDGED')throw Error('disk full');}});
    assert.equal(r.status,'MUTATION_OUTCOME_UNKNOWN');assert.equal(calls.length,1);
  });
  await test('duplicate creation ID stops before accessing second target',async()=>{const {result:r,calls}=await execute(s=>{if(s.call.index===7)s.result.uuid=[...s.databases.keys()][0];});assert.equal(r.code,'CREATED_TARGET_REFUSED');assert.equal(calls.length,7);});
  for(const index of [1,3,4,14,15,22,30,34]) await test('lost mutation acknowledgement at request '+index+' stops without retry',async()=>{
    const {result:r,calls}=await execute(s=>{if(s.call.index===index)throw Error('provider includes secret '+token);});
    assert.equal(r.status,'MUTATION_OUTCOME_UNKNOWN');assert.equal(calls.length,index);assert.equal(r.code,'REQUEST_FAILED');assert(!JSON.stringify(r).includes(token));
  });
  await test('read failure never triggers rollback or extra request',async()=>{const {result:r,calls}=await execute(s=>{if(s.call.index===2)throw Error('down');});assert.equal(r.status,'STOPPED_UNQUALIFIED');assert.equal(calls.length,2);});
  await test('provider success with wrong row value refuses parity',async()=>{const {result:r,calls}=await execute(s=>{if(s.call.index===24)s.result[0].results[0].value='wrong';});assert.equal(r.code,'PARITY_REFUSED');assert.equal(calls.length,24);});
  await test('post-restore identity drift cannot pass',async()=>{const {result:r}=await execute(s=>{if(s.call.index===23)s.result.name='rebound';});assert.equal(r.code,'TARGET_IDENTITY_REFUSED');assert.notEqual(r.status,'SYNTHETIC_SUBGATE_PASSED');});
  await test('restore missing previous bookmark stops before undo',async()=>{const {result:r,calls}=await execute(s=>{if(s.call.index===22)delete s.result.previous_bookmark;});assert.equal(r.code,'RESTORE_RESPONSE_REFUSED');assert.equal(calls.length,22);});
  await test('malformed bookmark is rejected before corruption',async()=>{const {result:r,calls}=await execute(s=>{if(s.call.index===6)s.result.bookmark='../../beta';});assert.equal(r.code,'BOOKMARK_REFUSED');assert.equal(calls.length,6);});
  await test('denied create retains bounded numeric response diagnostics without leaking provider text',async()=>{
    const journal=[];const {result:r,calls}=await execute(s=>{if(s.call.index===1)s.response=Response.json({success:false,errors:[{code:10000,message:token}],result:null},{status:403});},{record:e=>journal.push(e)});
    assert.deepEqual(r.providerResponses?.map(x=>({httpStatus:x.httpStatus,providerErrorCodes:x.providerErrorCodes})),[{httpStatus:403,providerErrorCodes:[10000]}]);
    assert.equal(r.status,'MUTATION_OUTCOME_UNKNOWN');assert.equal(calls.length,1);assert(!JSON.stringify({r,journal}).includes(token));
  });
  for(const status of [400,401,409,429,500,503]) await test('HTTP '+status+' refusal records metadata but never retries',async()=>{
    const journal=[];const {result:r,calls}=await execute(s=>{if(s.call.index===1)s.response=Response.json({success:false,errors:[{code:10000,message:token,documentation_url:'https://invalid/'+token}],result:null},{status});},{record:e=>journal.push(e)});
    assert.equal(r.status,'MUTATION_OUTCOME_UNKNOWN');assert.equal(r.code,'RESPONSE_REFUSED');assert.equal(calls.length,1);
    assert.equal(r.providerResponses[0].httpStatus,status);assert.deepEqual(r.providerResponses[0].providerErrorCodes,[10000]);
    assert(journal.some(e=>e.state==='RESPONSE_HEADERS_OBSERVED'&&e.httpStatus===status));assert(journal.some(e=>e.state==='RESPONSE_DIAGNOSTICS'&&e.providerErrorCodes[0]===10000));
    assert(!journal.some(e=>e.state==='ENVELOPE_ACKNOWLEDGED'));assert(!JSON.stringify({r,journal}).includes(token));
  });
  await test('numeric error projection deduplicates bounds and omits arbitrary strings',async()=>{
    const errors=[{code:token,message:token},{code:'10000'},{code:999},{code:-1000},{code:1000.5},{code:2147483648},{code:10000},{code:10000},...Array.from({length:12},(_,i)=>({code:11000+i,message:token}))];
    const {result:r}=await execute(s=>{if(s.call.index===1)s.response=Response.json({success:false,errors,result:null},{status:403});});
    assert.deepEqual(r.providerResponses[0].providerErrorCodes,[10000,11000,11001,11002,11003,11004,11005,11006]);assert(!JSON.stringify(r).includes(token));
  });
  await test('HTTP200 error envelope preserves codes and remains UNKNOWN',async()=>{
    const {result:r,calls}=await execute(s=>{if(s.call.index===1)s.response=Response.json({success:true,errors:[{code:7500,message:token}],result:s.result});});
    assert.equal(r.providerResponses[0].httpStatus,200);assert.equal(r.providerResponses[0].apiSuccess,true);assert.deepEqual(r.providerResponses[0].providerErrorCodes,[7500]);assert.equal(r.status,'MUTATION_OUTCOME_UNKNOWN');assert.equal(calls.length,1);
  });
  await test('malformed error body preserves HTTP without storing text',async()=>{
    const {result:r}=await execute(s=>{if(s.call.index===1)s.response=new Response(token,{status:403});});assert.equal(r.providerResponses[0].httpStatus,403);assert.equal(r.providerResponses[0].bodyStatus,'INVALID_JSON');assert(!JSON.stringify(r).includes(token));
  });
  await test('oversized error body keeps size bound and header evidence',async()=>{
    const {result:r}=await execute(s=>{if(s.call.index===1)s.response=new Response(token.repeat(3000),{status:403});});assert.equal(r.code,'RESPONSE_TOO_LARGE');assert.equal(r.providerResponses[0].bodyStatus,'TOO_LARGE');assert.equal(r.providerResponses[0].httpStatus,403);assert(!JSON.stringify(r).includes(token));
  });
  await test('redirect status body is not read or retained',async()=>{
    let response;const {result:r}=await execute(s=>{if(s.call.index===1){response=Response.json({success:false,errors:[{code:10000,message:token}]},{status:302});s.response=response;}});
    assert.equal(response.bodyUsed,false);assert.equal(r.providerResponses[0].routeVerified,false);assert.equal(r.providerResponses[0].bodyStatus,'NOT_READ');assert.deepEqual(r.providerResponses[0].providerErrorCodes,[]);assert(!JSON.stringify(r).includes(token));
  });
  await test('changed final URL is never logged or consumed',async()=>{
    let response;const {result:r}=await execute(s=>{if(s.call.index===1){response=Response.json({success:false,errors:[{code:10000,message:token}]});Object.defineProperty(response,'url',{value:'https://invalid/'+token});s.response=response;}});
    assert.equal(response.bodyUsed,false);assert.equal(r.providerResponses[0].routeVerified,false);assert(!JSON.stringify(r).includes(token));
  });
  await test('unexpected202 mutation response is diagnostic evidence only',async()=>{
    const {result:r,calls}=await execute(s=>{if(s.call.index===1)s.response=Response.json({success:true,errors:[],result:s.result},{status:202});});assert.equal(r.providerResponses[0].httpStatus,202);assert.equal(r.providerResponses[0].apiSuccess,true);assert.equal(r.status,'MUTATION_OUTCOME_UNKNOWN');assert.equal(calls.length,1);
  });
  await test('201 remains accepted only for collection creation',async()=>{
    const {result:r}=await execute(s=>{if(s.call.index===1)s.response=Response.json({success:true,errors:[],result:s.result},{status:201});});assert.equal(r.status,'SYNTHETIC_SUBGATE_PASSED');assert.equal(r.providerResponses[0].httpStatus,201);assert.equal(r.providerResponses.length,44);
    const bad=await execute(s=>{if(s.call.index===2)s.response=Response.json({success:true,errors:[],result:s.result},{status:201});});assert.equal(bad.result.status,'STOPPED_UNQUALIFIED');assert.equal(bad.calls.length,2);assert.equal(bad.result.providerResponses[1].httpStatus,201);
  });
  await test('missing errors array is distinguishable without accepting the envelope',async()=>{
    const {result:r}=await execute(s=>{if(s.call.index===1)s.response=Response.json({success:true,result:s.result});});assert.equal(r.providerResponses[0].errorsArray,false);assert.equal(r.providerResponses[0].resultPresent,true);assert.equal(r.status,'MUTATION_OUTCOME_UNKNOWN');
  });
  await test('headers persist before a stalled body times out',async()=>{
    const journal=[];const {result:r,calls}=await execute(s=>{if(s.call.index===1)s.response=new Response(new ReadableStream({start(){},cancel(){}}),{status:403});},{timeoutMs:5,record:e=>journal.push(e)});
    assert.equal(r.code,'REQUEST_TIMEOUT');assert.equal(calls.length,1);assert.equal(r.providerResponses[0].httpStatus,403);assert.equal(r.providerResponses[0].bodyStatus,'INCOMPLETE');assert(journal.some(e=>e.state==='RESPONSE_HEADERS_OBSERVED'&&e.httpStatus===403));assert(!journal.some(e=>e.state==='ENVELOPE_ACKNOWLEDGED'));
  });
  for(const state of ['RESPONSE_HEADERS_OBSERVED','RESPONSE_DIAGNOSTICS']) await test('journal failure at '+state+' cannot acknowledge or retry mutation',async()=>{
    const {result:r,calls}=await execute(undefined,{record:e=>{if(e.state===state)throw Error('private disk '+token);}});assert.equal(r.status,'MUTATION_OUTCOME_UNKNOWN');assert.equal(calls.length,1);assert.equal(r.providerResponses[0].httpStatus,200);assert(!JSON.stringify(r).includes(token));
  });
  await test('lost response has no invented status or provider cause',async()=>{
    const {result:r}=await execute(s=>{if(s.call.index===1)throw Error(token);});assert.deepEqual(r.providerResponses,[]);assert.equal(r.status,'MUTATION_OUTCOME_UNKNOWN');assert(!JSON.stringify(r).includes(token));
  });
  await test('all successful request observations are fixed-shape and bounded',async()=>{
    const {result:r}=await execute();const keys='apiSuccess,bodyStatus,errorsArray,httpStatus,providerErrorCodes,requestNumber,resultPresent,routeVerified,stage';
    assert.equal(r.providerResponses.length,44);assert(r.providerResponses.every((x,i)=>Object.keys(x).sort().join(',')===keys&&x.requestNumber===i+1&&x.bodyStatus==='JSON_COMPLETE'&&x.apiSuccess===true&&x.providerErrorCodes.length===0));
    assert(!JSON.stringify(r.providerResponses).includes('baseline-a'));assert(!JSON.stringify(r.providerResponses).includes('11111111-1111'));
  });
  for(const kind of ['redirect','denied','oversize','invalid-json','errors','false-success']) await test('bounded response rejects '+kind,async()=>{
    const {result:r,calls}=await execute(s=>{if(s.call.index!==1)return;
      if(kind==='redirect')s.response=new Response('',{status:302});
      if(kind==='denied')s.response=new Response('private provider details',{status:403});
      if(kind==='oversize')s.response=new Response('x'.repeat(65537));
      if(kind==='invalid-json')s.response=new Response('{');
      if(kind==='errors')s.response=Response.json({success:true,errors:[{message:token}],result:s.result});
      if(kind==='false-success')s.response=Response.json({success:false,errors:[],result:s.result});
    });assert.equal(r.status,'MUTATION_OUTCOME_UNKNOWN');assert.equal(calls.length,1);assert(!JSON.stringify(r).includes(token));
  });
  await test('request that ignores abort remains unknown and cannot advance later',async()=>{
    let release;const p=provider(s=>{if(s.call.index===1)return new Promise(resolve=>{release=resolve;});});
    try{const r=await run({plan:input,approved:true,token,request:p.request,timeoutMs:5});assert.equal(r.status,'MUTATION_OUTCOME_UNKNOWN');assert.equal(r.code,'REQUEST_TIMEOUT');release();await new Promise(setImmediate);assert.equal(p.calls.length,1);assert.equal(r.events.at(-1).state,'UNKNOWN_DO_NOT_RETRY');}finally{p.close();}
  });
  await test('response-body stall is bounded as part of request deadline',async()=>{
    const {result:r,calls}=await execute(s=>{if(s.call.index===1)s.response=new Response(new ReadableStream({start(){},cancel(){}}));},{timeoutMs:5});assert.equal(r.code,'REQUEST_TIMEOUT');assert.equal(calls.length,1);
  });
  await test('slow recovery misses explicit goal despite exact data',async()=>{
    let clock=0;const {result:r}=await execute(()=>{clock+=5000;},{now:()=>clock});assert.equal(r.status,'SYNTHETIC_RTO_GOAL_MISSED');assert.equal(r.checkpointRowsLost,0);assert(r.syntheticPairRecoveryMs>60000);
  });
  await test('manual workflow is disarmed, source-pinned and separated from metadata credentials',async()=>{
    const code=fs.readFileSync('.github/workflows/phase8d-synthetic-pitr.yml','utf8');
    assert(code.includes('default: false'));assert(!/^  (push|pull_request|schedule):/m.test(code));
    assert(code.includes("github.event_name == 'workflow_dispatch' && inputs.execute_new_synthetic_d1 == true && github.ref == 'refs/heads/audit/phase8d-d1-qualification'"));
    assert(code.includes('inputs.approved_source_sha!==process.env.GITHUB_SHA'));
    const validation=code.slice(code.indexOf('      - name: Validate'),code.indexOf('      - name: Run only'));
    assert(!validation.includes('secrets.CLOUDFLARE_API_TOKEN'));assert(!code.slice(code.indexOf('  isolated-synthetic-pitr:')).includes('secrets.CLOUDFLARE_AUDIT_READ_TOKEN'));
    assert(code.includes('cancel-in-progress: false'));assert(code.includes('if: always()'));assert(code.includes('synthetic-pitr-plan.json.progress.jsonl'));
    assert(!code.includes('${{ inputs.'));assert(code.includes('retention-days: 14'));
  });
  await test('private CLI dry plan is zero-network and execution requires exact manual authority',async()=>{
    const file=path.join(dir,'plan.json');fs.writeFileSync(file,JSON.stringify(input),{mode:0o600});
    const env={...process.env,CLOUDFLARE_API_TOKEN:'must-not-fallback',CLOUDFLARE_D1_DRILL_TOKEN:'',GITHUB_EVENT_NAME:'push'};
    let r=spawnSync(process.execPath,[moduleFile,file],{encoding:'utf8',env});assert.equal(r.status,0);assert.equal(JSON.parse(r.stdout).maximumRequests,44);
    r=spawnSync(process.execPath,[moduleFile,file,'--execute-new-synthetic-d1'],{encoding:'utf8',env});assert.equal(r.status,1);assert.equal(r.stdout,'');
    for(const kind of ['symlink','hardlink','public','fifo']){
      const bad=path.join(dir,kind);if(kind==='symlink')fs.symlinkSync(file,bad);if(kind==='hardlink')fs.linkSync(file,bad);if(kind==='public')fs.writeFileSync(bad,JSON.stringify(input),{mode:0o644});if(kind==='fifo')spawnSync('mkfifo',[bad]);
      r=spawnSync(process.execPath,[moduleFile,bad],{encoding:'utf8',env,timeout:1000});assert.equal(r.status,1);assert.equal(r.stdout,'');if(kind==='hardlink')fs.unlinkSync(bad);
    }
  });
} finally { fs.rmSync(dir,{recursive:true,force:true}); }
console.log(JSON.stringify({suite:'synthetic-d1-pitr',passed,failed:0,scope:'offline SQLite provider model only; no live creation, restore, elapsed cloud RTO, full Brick recovery or acceptance'}));
