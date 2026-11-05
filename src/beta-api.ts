import { readBoundedBody } from './bounded-body';
import { backgroundWorkStatus } from './background-work';
import { verifyDeviceSignature } from './crypto';
import { history } from './phase4';
import { BETA_RELEASE } from './beta-release';
import type { BrickDevice } from './device-do';

export type BetaEnv={DB:D1Database;BETA_DB:D1Database;HISTORY:R2Bucket;EVENTS:Queue;BRICK_DEVICE:DurableObjectNamespace<BrickDevice>;BETA_RATE:RateLimit;BETA_PARENT_RATE:RateLimit;APP_ENV:string;BETA_CHANNEL:string;BETA_SOURCE_SHA:string;BETA_STORAGE_MODE?:string;BETA_SCHEDULER?:DurableObjectNamespace<import('./beta-scheduler').BetaScheduler>};
type Obj=Record<string,unknown>;
type Challenge={token:string;expires_at:number;queue_at:number|null;portal_at:number|null};
export const betaJson=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const int=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const obj=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v);
const canonical=(v:unknown):string=>JSON.stringify(v,(_key,value)=>obj(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
const short=(v:unknown,n=160):v is string=>typeof v==='string'&&v.length<=n&&!/[\u0000-\u001f<>]/.test(v);
function check(ok:unknown):asserts ok{if(!ok)throw Error('invalid_beta_schema');}
export async function activeDevice(env:BetaEnv,id:string){return /^[A-Za-z0-9_-]{1,128}$/.test(id)?env.DB.prepare('SELECT public_key_spki_b64 FROM devices WHERE id=?1 AND revoked_at IS NULL').bind(id).first<{public_key_spki_b64:string}>():null;}
function checkRows(value:unknown){
 check(Array.isArray(value)&&value.length>=1&&value.length<=80);const ids=new Set<string>();
 for(const row of value){check(obj(row)&&Object.keys(row).every(k=>['id','status','required','detail'].includes(k))&&typeof row.id==='string'&&/^[A-Za-z0-9_]{1,90}$/.test(row.id)&&!ids.has(row.id)&&['PASS','FAIL','PENDING','UNSUPPORTED'].includes(String(row.status))&&typeof row.required==='boolean'&&short(row.detail,600));ids.add(row.id);}
 return value;
}
const healthKeys=new Set(['recordedAtMs','serviceUptimeMs','locationAgeMs','locationCallbackAgeMs','ackAgeMs','pendingRecords','pendingSafetyEvents','oldestPendingAgeMs','network','locationEnabled','locationSubscribed','batteryPct','charging','activityMode','trackingIntervalMs','recoveryCount','healthSequence','networkValidated','journalWriteHealthy']);
function observation(v:unknown){
 check(obj(v));check(Object.keys(v).every(k=>['wallMs','elapsedMs','boot','health','sameBootGapMs','bootChanged','clockDeltaMs'].includes(k)));
 check(int(v.wallMs)&&int(v.elapsedMs)&&Number.isSafeInteger(v.boot)&&typeof v.bootChanged==='boolean'&&(v.sameBootGapMs===null||int(v.sameBootGapMs))&&(v.clockDeltaMs===undefined||Number.isSafeInteger(v.clockDeltaMs))&&obj(v.health));
 for(const [k,x] of Object.entries(v.health)){
  check(healthKeys.has(k)||/^[A-Za-z0-9_]{1,60}Provider(?:Capability|Health)$/.test(k));
  check(x===null||typeof x==='boolean'||typeof x==='number'&&Number.isFinite(x)||short(x,80));
 }
 return v;
}
function runMetadata(v:unknown){
 check(obj(v)&&Object.keys(v).every(k=>['runId','startedAtMs','releaseId','apkSourceSha','bindingHash','version','model','android','osBuild','escapeVerifiedByUser'].includes(k)));
 check(uuid(v.runId)&&int(v.startedAtMs)&&v.startedAtMs<=Date.now()+120000&&v.releaseId===BETA_RELEASE.releaseId&&v.apkSourceSha===BETA_RELEASE.apkSourceSha&&typeof v.bindingHash==='string'&&/^[0-9a-f]{64}$/.test(v.bindingHash)&&v.version===BETA_RELEASE.versionName&&v.escapeVerifiedByUser===true&&short(v.model)&&short(v.android)&&short(v.osBuild));return v;
}
function readiness(v:unknown){
 check(obj(v)&&Object.keys(v).every(k=>['format','releaseId','apkSourceSha','checkedAtMs','bindingHash','coreReady','checks','limits'].includes(k))&&v.format==='brick-beta-readiness-v1'&&v.releaseId===BETA_RELEASE.releaseId&&v.apkSourceSha===BETA_RELEASE.apkSourceSha&&int(v.checkedAtMs)&&typeof v.bindingHash==='string'&&/^[0-9a-f]{64}$/.test(v.bindingHash)&&typeof v.coreReady==='boolean'&&short(v.limits,400));checkRows(v.checks);return v;
}
async function challenge(env:BetaEnv,id:string,now:number){
 await env.BETA_DB.prepare('INSERT INTO beta_challenges(device_id,token,expires_at) VALUES(?1,?2,?3) ON CONFLICT(device_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at,queue_at=NULL,portal_at=NULL WHERE beta_challenges.expires_at<?4').bind(id,crypto.randomUUID(),now+300000,now).run();
 return (await env.BETA_DB.prepare('SELECT token,expires_at,queue_at,portal_at FROM beta_challenges WHERE device_id=?1').bind(id).first<Challenge>())!;
}
async function proofs(env:BetaEnv,id:string,now:number){
 const rows:{id:string;status:string;detailCode:string}[]=[];
 async function probe(name:string,work:()=>Promise<boolean>){try{const ok=await work();rows.push({id:name,status:ok?'PASS':'PENDING',detailCode:ok?'verified':'evidence_pending'});}catch{rows.push({id:name,status:'FAIL',detailCode:'service_probe_failed'});}}
 const c=await challenge(env,id,now);
 await probe('d1_roundtrip',async()=>{
  const token=JSON.stringify({probe:crypto.randomUUID()});const r=await env.DB.prepare("INSERT INTO audit_log(event_type,method,path,status,created_at,detail_json) SELECT 'beta_service_probe','INTERNAL','/beta/probe',200,?1,?2 WHERE EXISTS(SELECT 1 FROM devices WHERE id=?3 AND revoked_at IS NULL)").bind(now,token,id).run();
  const key=r.meta.last_row_id;try{return (await env.DB.prepare("SELECT detail_json FROM audit_log WHERE id=?1 AND event_type='beta_service_probe'").bind(key).first<{detail_json:string}>())?.detail_json===token;}finally{await env.DB.prepare("DELETE FROM audit_log WHERE id=?1 AND event_type='beta_service_probe' AND detail_json=?2").bind(key,token).run();}
 });
 await probe('object_store_roundtrip',async()=>{const key='beta/probes/'+id+'/'+crypto.randomUUID();try{await env.HISTORY.put(key,c.token);const v=await env.HISTORY.get(key);return await v?.text()===c.token;}finally{await env.HISTORY.delete(key);}});
 await probe('event_persistence_roundtrip',async()=>{await env.EVENTS.send({type:'brick_beta_probe_v1',deviceId:id,token:c.token});const receipt=await env.BETA_DB.prepare('SELECT queue_at FROM beta_challenges WHERE device_id=?1 AND token=?2').bind(id,c.token).first<{queue_at:number|null}>();return typeof receipt?.queue_at==='number'&&receipt.queue_at>=now-300000;});
 await probe('do_roundtrip',async()=>{const stub=env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(id));const r=await stub.fetch(new Request('https://internal/beta/probe',{method:'POST',body:JSON.stringify({deviceId:id,token:c.token,expiresAt:c.expires_at})}));if(!r.ok)return false;const b=await r.json<{token:string;stateReadable:boolean}>();const scheduler=env.BETA_SCHEDULER?await env.BETA_SCHEDULER.get(env.BETA_SCHEDULER.idFromName('beta-maintenance')).status():null;return b.token===c.token&&b.stateReadable===true&&typeof scheduler?.nextAlarmAt==='number'&&scheduler.nextAlarmAt>Date.now()&&scheduler.lastTick?.status==='COMPLETED'&&scheduler.lastTick.atMs>=now-180000;});
 await probe('history_readback',async()=>{const r=await history(env,id,now-3600000,now);if(!r.ok)return false;const b=await r.json<{points:unknown[]}>();return Array.isArray(b.points)&&b.points.length>0;});
 await probe('portal_delivery',async()=>c.portal_at!==null&&c.portal_at>=now-300000);
 return rows;
}
export async function betaDevice(req:Request,env:BetaEnv,id:string,kind:string){
 if(env.APP_ENV!=='development'||env.BETA_STORAGE_MODE!=='d1'||env.BETA_CHANNEL!=='beta'||!/^[a-f0-9]{40}$/.test(env.BETA_SOURCE_SHA??''))return betaJson({error:'beta_deployment_unavailable'},503);
 if(req.method!=='POST')return betaJson({error:'method_not_allowed'},405);
 try{
  if(!env.BETA_RATE||!(await env.BETA_RATE.limit({key:'beta-ip:'+(req.headers.get('CF-Connecting-IP')??'unknown')})).success)return betaJson({error:'beta_rate_limited'},429);
  if(!req.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return betaJson({error:'json_required'},415);
  const d=await activeDevice(env,id);if(!d)return betaJson({error:'device_unauthorized'},401);
  const sig=req.headers.get('X-Brick-Signature');const bounded=await readBoundedBody(req,65536);
  if(!bounded.ok||!bounded.body.byteLength)return betaJson({error:'invalid_body'},400);
  if(!sig||sig.length>512||!await verifyDeviceSignature(d.public_key_spki_b64,bounded.body,sig))return betaJson({error:'signature_required'},401);
  if(!(await env.BETA_RATE.limit({key:'beta-device:'+id})).success)return betaJson({error:'beta_rate_limited'},429);
  let b:Obj;try{b=JSON.parse(new TextDecoder().decode(bounded.body));check(obj(b));check(b.protocol===1&&uuid(b.nonce)&&b.releaseId===BETA_RELEASE.releaseId&&b.apkSourceSha===BETA_RELEASE.apkSourceSha&&int(b.sentAtMs)&&Math.abs(Date.now()-b.sentAtMs)<=120000);
   if(kind==='readiness'){check(b.appVersion===BETA_RELEASE.versionName&&int(b.localCheckedAtMs)&&Math.abs(Date.now()-b.localCheckedAtMs)<=120000);checkRows(b.localChecks);}
   else{runMetadata(b.run);check(Array.isArray(b.records)&&b.records.length>0&&b.records.length<=20&&int(b.droppedRecords));let last=0;for(const row of b.records){check(obj(row)&&int(row.id)&&row.id>last);last=row.id;observation(row.observation);}if(b.readiness!==null)readiness(b.readiness);}
  }catch{return betaJson({error:'invalid_beta_schema'},400);}
  const now=Date.now();
  const reservation=await env.BETA_DB.prepare('INSERT INTO beta_requests(nonce,device_id,expires_at) VALUES(?1,?2,?3) ON CONFLICT(nonce) DO NOTHING').bind(b.nonce,id,now+600000).run();
  if(reservation.meta.changes!==1)return betaJson({error:'replayed_nonce'},409);
  if(!await activeDevice(env,id))return betaJson({error:'device_revoked'},401);
  const response={storageMode:'d1-chunked',eventMode:'direct-d1-durable',protocol:1,nonce:b.nonce,environment:'beta',releaseId:BETA_RELEASE.releaseId,backendSourceSha:env.BETA_SOURCE_SHA,serverReceivedAtMs:now};
  if(kind==='readiness'){
   const checks=await proofs(env,id,now);await env.BETA_DB.prepare('INSERT INTO beta_latest(device_id,payload,updated_at) VALUES(?1,?2,?3) ON CONFLICT(device_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(id,JSON.stringify({localChecks:b.localChecks,localCheckedAtMs:b.localCheckedAtMs,appVersion:b.appVersion,apkSourceSha:b.apkSourceSha,checks}),now).run();return betaJson({...response,checks});
  }
  const run=b.run as Obj,records=b.records as {id:number;observation:Obj}[];const metadata=canonical(run);
  const previous=await env.BETA_DB.prepare('SELECT metadata FROM beta_runs WHERE device_id=?1 AND run_id=?2').bind(id,run.runId).first<{metadata:string}>();
  if(previous&&previous.metadata!==metadata)return betaJson({error:'run_identity_conflict'},409);
  for(const row of records){const prior=await env.BETA_DB.prepare('SELECT payload FROM beta_records WHERE device_id=?1 AND run_id=?2 AND record_id=?3').bind(id,run.runId,row.id).first<{payload:string}>();if(prior&&prior.payload!==canonical(row.observation))return betaJson({error:'record_conflict'},409);}
  await env.BETA_DB.batch([
   env.BETA_DB.prepare('INSERT INTO beta_runs(device_id,run_id,metadata,readiness,dropped,updated_at) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(device_id,run_id) DO UPDATE SET readiness=excluded.readiness,dropped=MAX(beta_runs.dropped,excluded.dropped),updated_at=excluded.updated_at WHERE beta_runs.metadata=excluded.metadata').bind(id,run.runId,metadata,JSON.stringify(b.readiness),b.droppedRecords,now),
   ...records.map(row=>env.BETA_DB.prepare('INSERT INTO beta_records(device_id,run_id,record_id,payload,received_at) SELECT ?1,?2,?3,?4,?5 WHERE EXISTS(SELECT 1 FROM beta_runs WHERE device_id=?1 AND run_id=?2 AND metadata=?6) ON CONFLICT(device_id,run_id,record_id) DO UPDATE SET payload=CASE WHEN beta_records.payload=excluded.payload THEN beta_records.payload ELSE NULL END').bind(id,run.runId,row.id,canonical(row.observation),now,metadata))
  ]);
  // Acknowledge only exact committed readback, including concurrent retry/conflict races.
  const saved=await env.BETA_DB.prepare('SELECT metadata FROM beta_runs WHERE device_id=?1 AND run_id=?2').bind(id,run.runId).first<{metadata:string}>();
  if(saved?.metadata!==metadata)return betaJson({error:'run_identity_conflict'},409);
  for(const row of records){const saved=await env.BETA_DB.prepare('SELECT payload FROM beta_records WHERE device_id=?1 AND run_id=?2 AND record_id=?3').bind(id,run.runId,row.id).first<{payload:string}>();if(saved?.payload!==canonical(row.observation))return betaJson({error:'record_conflict'},409);}
  return betaJson({...response,runId:run.runId,acceptedThroughId:records[records.length-1].id});
 }catch{return betaJson({error:'beta_service_unavailable'},503);}
}
export async function consumeBetaProbe(message:Message<unknown>,env:BetaEnv){
 const b=message.body as Obj;if(!obj(b)||b.type!=='brick_beta_probe_v1')return false;
 if(typeof b.deviceId!=='string'||!uuid(b.token)){message.ack();return true;}
 try{if(!await activeDevice(env,b.deviceId)){message.ack();return true;}
  await env.BETA_DB.prepare('UPDATE beta_challenges SET queue_at=?1 WHERE device_id=?2 AND token=?3 AND expires_at>=?1').bind(Date.now(),b.deviceId,b.token).run();message.ack();
 }catch{message.retry();}return true;
}
export async function betaParent(req:Request,env:BetaEnv,id:string,action:string){
 if(!await activeDevice(env,id))return betaJson({error:'device_unavailable'},404);
 if(req.method==='GET'&&action==='status'){
  const latest=await env.BETA_DB.prepare('SELECT payload,updated_at FROM beta_latest WHERE device_id=?1').bind(id).first<{payload:string;updated_at:number}>();
  const runs=await env.BETA_DB.prepare('SELECT run_id,metadata,readiness,dropped,updated_at FROM beta_runs WHERE device_id=?1 ORDER BY updated_at DESC LIMIT 10').bind(id).all<{run_id:string;metadata:string;readiness:string;dropped:number;updated_at:number}>();
  const run=runs.results?.[0];let evidence:unknown=null;
  if(run){const records=await env.BETA_DB.prepare('SELECT record_id,payload FROM beta_records WHERE device_id=?1 AND run_id=?2 ORDER BY record_id DESC LIMIT 100').bind(id,run.run_id).all<{record_id:number;payload:string}>();const counts=await env.BETA_DB.prepare('SELECT COUNT(*) n,MIN(received_at) first_at,MAX(received_at) last_at FROM beta_records WHERE device_id=?1 AND run_id=?2').bind(id,run.run_id).first();const review=await env.BETA_DB.prepare('SELECT payload FROM beta_reviews WHERE device_id=?1 AND run_id=?2').bind(id,run.run_id).first<{payload:string}>();evidence={run:JSON.parse(run.metadata),readiness:JSON.parse(run.readiness),dropped:run.dropped,receivedAt:run.updated_at,records:records.results.map(x=>({id:x.record_id,observation:JSON.parse(x.payload)})),counts,review:review?JSON.parse(review.payload):null,assessment:'REVIEW_REQUIRED',phoneStopState:'NOT_UPLOADED_USE_PRIVATE_EXPORT'};}
  const scheduler=env.BETA_SCHEDULER?await env.BETA_SCHEDULER.get(env.BETA_SCHEDULER.idFromName('beta-maintenance')).status():null;
  const backgroundWork=await backgroundWorkStatus(env.DB,id);
  return betaJson({scheduler,backgroundWork,release:BETA_RELEASE,backendSourceSha:env.BETA_SOURCE_SHA,deviceId:id,latest:latest?{...JSON.parse(latest.payload),receivedAt:latest.updated_at,stale:Date.now()-latest.updated_at>300000}:null,evidence});
 }
 if(req.method==='POST'&&action==='ack'){
  const read=await readBoundedBody(req,1024);if(!read.ok)return betaJson({error:'invalid_body'},400);
  let b:Obj;try{b=JSON.parse(new TextDecoder().decode(read.body));check(obj(b)&&uuid(b.token));}catch{return betaJson({error:'invalid_ack'},400);}
  const r=await env.BETA_DB.prepare('UPDATE beta_challenges SET portal_at=?1 WHERE device_id=?2 AND token=?3 AND expires_at>=?1').bind(Date.now(),id,b.token).run();return betaJson({acknowledged:r.meta.changes===1},r.meta.changes===1?200:409);
 }
 if(req.method==='POST'&&action==='import'){
  const read=await readBoundedBody(req,4*1024*1024);if(!read.ok)return betaJson({error:'export_too_large'},400);
  try{const b=JSON.parse(new TextDecoder().decode(read.body));check(obj(b)&&b.format==='brick-beta-observations-v1'&&obj(b.summary)&&obj(b.summary.run));const run=runMetadata(b.summary.run);const existing=await env.BETA_DB.prepare('SELECT metadata FROM beta_runs WHERE device_id=?1 AND run_id=?2').bind(id,run.runId).first<{metadata:string}>();check(existing&&JSON.parse(existing.metadata).bindingHash===run.bindingHash);const interventions=b.summary.interventions;check(Array.isArray(interventions)&&interventions.length<=500);for(const i of interventions){check(obj(i)&&Object.keys(i).every(k=>['atMs','elapsedMs','reason'].includes(k))&&int(i.atMs)&&int(i.elapsedMs)&&['PLANNED_NETWORK_TEST','PLANNED_DEVICE_REBOOT','UNPLANNED_RECOVERY','OTHER_USER_ACTION'].includes(String(i.reason)));}
   const summary={source:'PARENT_IMPORTED_PHONE_EXPORT_NOT_SIGNED',interventions,active:b.summary.active===true,stopReason:short(b.summary.stopReason)?b.summary.stopReason:null,assessment:'REVIEW_REQUIRED'};
   await env.BETA_DB.prepare('INSERT INTO beta_reviews(device_id,run_id,payload,updated_at) VALUES(?1,?2,?3,?4) ON CONFLICT(device_id,run_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(id,run.runId,JSON.stringify(summary),Date.now()).run();return betaJson({imported:true});
  }catch{return betaJson({error:'invalid_or_unmatched_export'},400);}
 }
 return betaJson({error:'method_not_allowed'},405);
}
export async function cleanupBeta(env:BetaEnv){
 const cutoff=Date.now()-35*86400000;
 for(const [table,column] of [['beta_requests','expires_at'],['beta_records','received_at'],['beta_runs','updated_at'],['beta_reviews','updated_at'],['beta_latest','updated_at'],['beta_challenges','expires_at']])await env.BETA_DB.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${column}<?1 LIMIT 1000)`).bind(table==='beta_requests'||table==='beta_challenges'?Date.now():cutoff).run();
}
