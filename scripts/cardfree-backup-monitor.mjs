// Staged off-platform monitor. Explicit one-shot calls only: no cron, background
// loop, production bootstrap, source mutation, upload, credentials or default sink.
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes} from 'node:crypto';
import {validateBackupHealthPolicy,checkProtectedBackupHealth} from './cardfree-backup-health.mjs';
import {validateB2ArchiveReceipt} from './cardfree-b2-destination.mjs';
import {validateBackupAlertReceiptPin,backupMonitorAlertDigest,verifyBackupAlertDeliveredReceipt} from './cardfree-backup-alert-receipt.mjs';
const TABLE='CREATE TABLE monitor_state(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL, digest TEXT NOT NULL)';
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const hash=v=>createHash('sha256').update(v).digest('hex');
const hex=(v,n)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const nonce=()=>randomBytes(16).toString('hex');
const clone=v=>structuredClone(v);
const refuse=()=>{throw Error('BACKUP_MONITOR_UNVERIFIED');};
const resultCodes=new Set(['AUTHENTICATED_READBACK_CURRENT','ARCHIVE_TOO_OLD','HEALTH_POLICY_INVALID','HEALTH_CONFIGURATION_INVALID','HEALTH_CLOCK_INVALID','HEALTH_FUTURE_CAPTURE','HEALTH_TIMEOUT','HEALTH_READ_UNVERIFIED','HEALTH_ARCHIVE_MISMATCH','HEALTH_AUTHENTICATION_UNVERIFIED','HEALTH_READBACK_MISMATCH','HEALTH_READ_UNAVAILABLE']);
function target(input){
 if(!exact(input,['policy','receipt']))refuse();
 const policy=validateBackupHealthPolicy(input.policy),receipt=validateB2ArchiveReceipt(input.receipt,input.receipt?.pinSha256);
 if(!hex(receipt.pinSha256,64)||receipt.archiveSha256!==policy.archiveSha256||receipt.fileName!=='brick-recovery/'+policy.context.backupId+'-'+policy.archiveSha256+'.brick')refuse();
 return{policy:{...policy,context:Object.fromEntries(['deployment','sourceSha','backupId','capturedAt','keyId'].map(k=>[k,policy.context[k]]))},receipt};
}
// First creation is an explicit one-time action on a new directory. Recurring
// entry points must omit create (or use false) and stop on any lost state.
export function openStagedBackupMonitor({directory,config:input,target:initial,clock=Date.now,create=false}={}){
 const receiptEnabled=input?.format==='brick-backup-monitor-config-v2';
 if(typeof create!=='boolean'||typeof directory!=='string'||!directory||typeof clock!=='function'||!exact(input,['format','monitorId','intervalMs','retryBaseMs','retryMaxMs',...(receiptEnabled?['deliveryReceiptPin']:[])])||!['brick-backup-monitor-config-v1','brick-backup-monitor-config-v2'].includes(input.format)||!hex(input.monitorId,32)||!Number.isSafeInteger(input.intervalMs)||input.intervalMs<60000||input.intervalMs>86400000||!Number.isSafeInteger(input.retryBaseMs)||input.retryBaseMs<1000||!Number.isSafeInteger(input.retryMaxMs)||input.retryMaxMs<input.retryBaseMs||input.retryMaxMs>input.intervalMs)refuse();
 let receiptPin;try{receiptPin=receiptEnabled?validateBackupAlertReceiptPin(input.deliveryReceiptPin):null;}catch{refuse();}
 const config={...Object.fromEntries(['format','monitorId','intervalMs','retryBaseMs','retryMaxMs'].map(k=>[k,input[k]])),...(receiptEnabled?{deliveryReceiptPin:receiptPin}:{})},configSha256=hash(JSON.stringify(config)),root=path.resolve(directory),file=path.join(root,'backup-monitor.sqlite');
 let db,closed=false,identity;
 function privateStat(p,directory=false){const s=fs.lstatSync(p);if(s.isSymbolicLink()||!(directory?s.isDirectory():s.isFile())||(s.mode&0o077)||!directory&&s.nlink!==1||typeof process.getuid==='function'&&s.uid!==process.getuid())refuse();return s;}
 function checkPath(){if(closed)refuse();privateStat(root,true);const s=privateStat(file);if(identity&&(s.dev!==identity.dev||s.ino!==identity.ino))refuse();for(const suffix of ['-journal','-wal','-shm']){try{privateStat(file+suffix);}catch(e){if(e.code!=='ENOENT')throw e;}}}
 function read(){checkPath();const rows=db.prepare('SELECT id,body,digest FROM monitor_state').all();if(rows.length!==1||rows[0].id!==1||rows[0].body.length>65536||hash(rows[0].body)!==rows[0].digest)refuse();const v=JSON.parse(rows[0].body);validate(v);return v;}
 function validate(v){
  if(!exact(v,['format','configSha256','target','revision','lastClockAt','nextCheckAt','claim','lastResult','lastSuccessAt','failures','incident','outbox','alertOverflow'])||v.format!=='brick-backup-monitor-state-v1'||v.configSha256!==configSha256||JSON.stringify(target(v.target))!==JSON.stringify(v.target)||!Number.isSafeInteger(v.revision)||v.revision<0||!positive(v.lastClockAt)||!positive(v.nextCheckAt)||!Number.isSafeInteger(v.failures)||v.failures<0||v.failures>32||typeof v.alertOverflow!=='boolean'||v.lastSuccessAt!==null&&(!positive(v.lastSuccessAt)||v.lastSuccessAt>v.lastClockAt))refuse();
  if(v.claim!==null&&(!exact(v.claim,['id','expiresAt','targetSha256'])||!hex(v.claim.id,32)||!positive(v.claim.expiresAt)||!hex(v.claim.targetSha256,64)||v.claim.targetSha256!==hash(JSON.stringify(v.target))))refuse();
  if(v.lastResult!==null&&(!exact(v.lastResult,['status','code','checkedAt','capturedAt','ageMs'])||!['FRESH','STALE','UNVERIFIED'].includes(v.lastResult.status)||!resultCodes.has(v.lastResult.code)||!positive(v.lastResult.checkedAt)||v.lastResult.checkedAt>v.lastClockAt||v.lastResult.capturedAt!==v.target.policy.context.capturedAt||v.lastResult.ageMs!==null&&(!Number.isSafeInteger(v.lastResult.ageMs)||v.lastResult.ageMs<0)||v.lastResult.status==='FRESH'&&(v.lastResult.code!=='AUTHENTICATED_READBACK_CURRENT'||v.lastSuccessAt!==v.lastResult.checkedAt)||v.lastResult.status==='STALE'&&v.lastResult.code!=='ARCHIVE_TOO_OLD'||v.lastResult.status==='UNVERIFIED'&&(!v.lastResult.code.startsWith('HEALTH_')||v.lastResult.ageMs!==null)||v.lastResult.status!=='UNVERIFIED'&&(v.lastResult.ageMs!==v.lastResult.checkedAt-v.lastResult.capturedAt||v.lastResult.status==='FRESH'&&v.lastResult.ageMs>v.target.policy.maxAgeMs||v.lastResult.status==='STALE'&&v.lastResult.ageMs<=v.target.policy.maxAgeMs)))refuse();
  if(v.incident!==null&&(!exact(v.incident,['id','openedAt','code'])||!hex(v.incident.id,32)||!positive(v.incident.openedAt)||v.incident.openedAt>v.lastClockAt||!resultCodes.has(v.incident.code)))refuse();
  if(!Array.isArray(v.outbox)||v.outbox.length>64)refuse();const ids=new Set();
  for(const row of v.outbox){const m=row?.message;if(!(exact(row,['message','state','deliveredAt'])||receiptEnabled&&exact(row,['message','state','deliveredAt','deliveryReceipt']))||!['PENDING','STARTED','DELIVERED','UNCERTAIN'].includes(row.state)||!exact(m,['format','eventId','monitorId','incidentId','kind','observedAt','capturedAt','code'])||m.format!=='brick-backup-monitor-alert-v1'||!hex(m.eventId,32)||ids.has(m.eventId)||m.monitorId!==config.monitorId||!hex(m.incidentId,32)||!['BACKUP_UNVERIFIED','BACKUP_STALE','BACKUP_RECOVERED'].includes(m.kind)||!positive(m.observedAt)||m.observedAt>v.lastClockAt||!positive(m.capturedAt)||!resultCodes.has(m.code)||row.state==='DELIVERED'&&(!positive(row.deliveredAt)||row.deliveredAt>v.lastClockAt)||row.state!=='DELIVERED'&&row.deliveredAt!==null)refuse();
   if(Object.hasOwn(row,'deliveryReceipt')){
    const proof=row.deliveryReceipt;if(!receiptEnabled||row.state!=='DELIVERED'||!exact(proof,['envelope','sha256','verifiedAt'])||!hex(proof.sha256,64)||!positive(proof.verifiedAt)||proof.verifiedAt>v.lastClockAt)refuse();
    const checked=verifyBackupAlertDeliveredReceipt(proof.envelope,receiptPin,{monitorId:config.monitorId,configSha256,eventId:m.eventId,messageSha256:backupMonitorAlertDigest(m),observedAt:m.observedAt,now:proof.verifiedAt});
    if(checked.sha256!==proof.sha256||row.deliveredAt!==checked.envelope.payload.deliveredAt)refuse();
   }
   ids.add(m.eventId);}
 }
 function now(min){const n=clock();if(!positive(n)||n<min||n>Number.MAX_SAFE_INTEGER-86400001)refuse();return n;}
 function write(v){validate(v);const body=JSON.stringify(v);if(body.length>65536)refuse();if(db.prepare('UPDATE monitor_state SET body=?,digest=? WHERE id=1').run(body,hash(body)).changes!==1)refuse();}
 function change(fn){let began=false;try{checkPath();db.exec('BEGIN IMMEDIATE');began=true;const v=read(),n=now(v.lastClockAt);v.lastClockAt=n;const r=fn(v,n);v.revision++;write(v);db.exec('COMMIT');began=false;return r;}catch{if(began)try{db.exec('ROLLBACK');}catch{}refuse();}}
 function queue(v,n,incident,kind,code){
  // Only confirmed delivered entries may be trimmed. Unknown sends never expire.
  const delivered=v.outbox.filter(r=>r.state==='DELIVERED').slice(-16),pending=v.outbox.filter(r=>r.state!=='DELIVERED');v.outbox=[...delivered,...pending];
  if(v.outbox.length>=64){v.alertOverflow=true;return;}
  v.outbox.push({message:{format:'brick-backup-monitor-alert-v1',eventId:nonce(),monitorId:config.monitorId,incidentId:incident.id,kind,observedAt:n,capturedAt:v.target.policy.context.capturedAt,code},state:'PENDING',deliveredAt:null});
 }
 try{
  // Initialization is a separate, one-time operator action. Normal restarts
  // must never recreate lost state, even when the original target is supplied.
  const initialTarget=create?target(initial):null,initialTime=create?now(0):null;
  if(create){fs.mkdirSync(root,{mode:0o700});privateStat(root,true);const fd=fs.openSync(file,'wx',0o600);fs.closeSync(fd);}
  else{privateStat(root,true);if(privateStat(file).size===0)refuse();}
  identity=privateStat(file);checkPath();db=new DatabaseSync(file,{timeout:25,allowExtension:false});checkPath();
  const schema=db.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();if(create?schema.length!==0:!(schema.length===1&&schema[0].name==='monitor_state'&&schema[0].sql===TABLE))refuse();
  db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
  if(create){const t=initialTarget,n=initialTime,v={format:'brick-backup-monitor-state-v1',configSha256,target:t,revision:0,lastClockAt:n,nextCheckAt:n,claim:null,lastResult:null,lastSuccessAt:null,failures:0,incident:null,outbox:[],alertOverflow:false};validate(v);const body=JSON.stringify(v);db.exec('BEGIN IMMEDIATE');try{db.exec(TABLE);db.prepare('INSERT INTO monitor_state VALUES(1,?,?)').run(body,hash(body));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}const fd=fs.openSync(root,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_DIRECTORY);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  else{const v=read();now(v.lastClockAt);if(initial!==undefined&&JSON.stringify(target(initial))!==JSON.stringify(v.target))refuse();}
 }catch{try{db?.close();}catch{}refuse();}
 const api={
  snapshot(){try{const v=read(),n=now(v.lastClockAt);let health=v.lastResult?.status??'UNVERIFIED',code=v.lastResult?.code??'NOT_CHECKED';if(v.claim){health='UNVERIFIED';code=v.claim.expiresAt>n?'CHECK_IN_PROGRESS':'CHECK_INTERRUPTED';}else if(health==='FRESH'&&n-v.target.policy.context.capturedAt>v.target.policy.maxAgeMs){health='STALE';code='ARCHIVE_TOO_OLD';}else if(health==='FRESH'&&n>=v.nextCheckAt){health='UNVERIFIED';code='CHECK_OVERDUE';}return{format:'brick-backup-monitor-snapshot-v1',health,code,observedAt:n,checkedAt:v.lastResult?.checkedAt??null,capturedAt:v.target.policy.context.capturedAt,lastSuccessAt:v.lastSuccessAt,nextCheckAt:v.nextCheckAt,failures:v.failures,alertPending:v.outbox.filter(r=>r.state==='PENDING').length,alertUncertain:v.outbox.filter(r=>['STARTED','UNCERTAIN'].includes(r.state)).length,alertDelivered:v.outbox.filter(r=>r.state==='DELIVERED').length,alertOverflow:v.alertOverflow,scheduleInstalled:false,deliveryQualified:false,recoveryQualified:false};}catch{refuse();}},
  replaceTarget(input){const next=target(input);return change((v,n)=>{if(next.receipt.pinSha256!==v.target.receipt.pinSha256||next.policy.context.deployment!==v.target.policy.context.deployment||next.policy.context.capturedAt<v.target.policy.context.capturedAt||next.policy.context.backupId===v.target.policy.context.backupId&&JSON.stringify(next)!==JSON.stringify(v.target))refuse();if(JSON.stringify(next)===JSON.stringify(v.target))return{changed:false};v.target=next;v.claim=null;v.lastResult=null;v.nextCheckAt=n;v.failures=0;return{changed:true};});},
  async check({key,readArchive,timeoutMs=15000}={}){
   if(typeof readArchive!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<5||timeoutMs>30000)refuse();
   const selected=change((v,n)=>{if(v.claim&&v.claim.expiresAt>n)return null;if(!v.claim&&n<v.nextCheckAt)return null;v.claim={id:nonce(),expiresAt:n+timeoutMs+1000,targetSha256:hash(JSON.stringify(v.target))};return{claim:{...v.claim},target:clone(v.target)};});
   if(!selected)return{applied:false,code:'NOT_DUE_OR_CHECKING',snapshot:api.snapshot()};
   const result=await checkProtectedBackupHealth({policy:selected.target.policy,key,clock,timeoutMs,readArchive:request=>readArchive({...request,receipt:clone(selected.target.receipt)})});
   const applied=change((v,n)=>{if(v.claim?.id!==selected.claim.id||v.claim.targetSha256!==hash(JSON.stringify(v.target))||n>=v.claim.expiresAt)return false;v.claim=null;
    v.lastResult={status:result.status,code:result.code,checkedAt:result.checkedAt??n,capturedAt:v.target.policy.context.capturedAt,ageMs:result.ageMs};
    if(result.status==='FRESH'){v.failures=0;v.lastSuccessAt=v.lastResult.checkedAt;v.nextCheckAt=Math.min(n+config.intervalMs,v.target.policy.context.capturedAt+v.target.policy.maxAgeMs+1);if(v.incident){queue(v,n,v.incident,'BACKUP_RECOVERED',result.code);v.incident=null;}}
    else{v.failures=Math.min(v.failures+1,32);v.nextCheckAt=n+Math.min(config.retryMaxMs,config.retryBaseMs*2**Math.min(v.failures-1,16));if(!v.incident){v.incident={id:nonce(),openedAt:n,code:result.code};queue(v,n,v.incident,result.status==='STALE'?'BACKUP_STALE':'BACKUP_UNVERIFIED',result.code);}else v.incident.code=result.code;}
    return true;});return{applied,code:applied?'CHECK_RECORDED':'SUPERSEDED',snapshot:api.snapshot()};
  },
  deliveryChallenges(){
   try{if(!receiptEnabled)refuse();const v=read();now(v.lastClockAt);return v.outbox.filter(r=>['STARTED','UNCERTAIN'].includes(r.state)).map(r=>({monitorId:config.monitorId,configSha256,authorityEpoch:receiptPin.authorityEpoch,recipientSha256:receiptPin.recipientSha256,eventId:r.message.eventId,messageSha256:backupMonitorAlertDigest(r.message),observedAt:r.message.observedAt}));}catch{refuse();}
  },
  reconcileDelivered(envelope){
   if(!receiptEnabled)refuse();let captured;try{captured=clone(envelope);}catch{refuse();}
   const result=change((v,n)=>{
    const row=v.outbox.find(r=>r.message.eventId===captured?.payload?.eventId);if(!row||!['STARTED','UNCERTAIN','DELIVERED'].includes(row.state))refuse();
    const proof=verifyBackupAlertDeliveredReceipt(captured,receiptPin,{monitorId:config.monitorId,configSha256,eventId:row.message.eventId,messageSha256:backupMonitorAlertDigest(row.message),observedAt:row.message.observedAt,now:n});
    if(row.state==='DELIVERED'){if(!row.deliveryReceipt||row.deliveryReceipt.sha256!==proof.sha256)refuse();return{reconciled:true,alreadyRecorded:true};}
    row.state='DELIVERED';row.deliveredAt=proof.envelope.payload.deliveredAt;row.deliveryReceipt=proof;return{reconciled:true,alreadyRecorded:false};
   });return{...result,snapshot:api.snapshot()};
  },
  async deliverNext({send,timeoutMs=15000}={}){
   if(typeof send!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<5||timeoutMs>30000)refuse();
   const message=change(v=>{const row=v.outbox.find(r=>r.state==='PENDING');if(!row)return null;row.state='STARTED';return clone(row.message);});
   if(!message)return{status:'NO_PENDING',snapshot:api.snapshot()};
   const abort=new AbortController();let timer,ack,success=false;
   try{const deadline=performance.now()+timeoutMs;ack=await Promise.race([Promise.resolve().then(()=>send({message:clone(message),signal:abort.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs);})]);success=performance.now()<deadline&&exact(ack,['delivered','eventId'])&&ack.delivered===true&&ack.eventId===message.eventId;}catch{}finally{clearTimeout(timer);abort.abort();}
   change((v,n)=>{const row=v.outbox.find(r=>r.message.eventId===message.eventId);if(!row)refuse();if(row.state==='DELIVERED'&&row.deliveryReceipt)return;if(row.state!=='STARTED')refuse();row.state=success?'DELIVERED':'UNCERTAIN';row.deliveredAt=success?n:null;});
   const snapshot=api.snapshot();const state=read().outbox.find(r=>r.message.eventId===message.eventId);return{status:state?.state==='DELIVERED'?'DELIVERED':success?'DELIVERED':'UNCERTAIN',snapshot};
  },
  close(){if(!closed){closed=true;db.close();}}
 };
 return Object.freeze(api);
}
