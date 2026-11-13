// Read-only off-platform primitive. No source capture, schedule, upload, restore,
// credential creation or production bootstrap. Caller supplies trusted policy/key.
import {createHash} from 'node:crypto';
import {openBackup,validateBackupContext,MAX_PACKAGE_BYTES} from './cardfree-backup-package.mjs';
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const positive=v=>Number.isSafeInteger(v)&&v>0;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateBackupHealthPolicy(p){
 if(!exact(p,['format','context','archiveSha256','maxAgeMs'])||p.format!=='brick-backup-health-policy-v1'||!positive(p.maxAgeMs)||p.maxAgeMs<60000||p.maxAgeMs>30*86400000||typeof p.archiveSha256!=='string'||!/^[a-f0-9]{64}$/.test(p.archiveSha256))throw Error('HEALTH_POLICY_INVALID');
 validateBackupContext(p.context);return{format:p.format,context:{...p.context},archiveSha256:p.archiveSha256,maxAgeMs:p.maxAgeMs};
}
export async function checkProtectedBackupHealth({policy:input,key,readArchive,clock=Date.now,timeoutMs=15000}={}){
 let policy,checkedAt=null,previousTime=0,copy,readback,opened;const controller=new AbortController(),started=performance.now();
 const result=(status,code,ageMs=null)=>({format:'brick-backup-health-v1',status,code,checkedAt,capturedAt:policy?.context.capturedAt??null,ageMs,maxAgeMs:policy?.maxAgeMs??null,authenticationVerified:status==='FRESH'||status==='STALE',readbackVerified:status==='FRESH'||status==='STALE',restorabilityVerified:false,qualification:'READ_ONLY_ARCHIVE_CHECK_NOT_SCHEDULE_OR_RECOVERY_ACCEPTANCE'});
 function now(){const t=clock();if(!positive(t)||t<previousTime)throw Error('HEALTH_CLOCK_INVALID');previousTime=t;checkedAt=t;return t;}
 async function read(){let timer;try{const remaining=timeoutMs-(performance.now()-started);if(remaining<=0)throw Error('HEALTH_TIMEOUT');const bytes=await Promise.race([Promise.resolve().then(()=>readArchive({signal:controller.signal,maxBytes:MAX_PACKAGE_BYTES})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('HEALTH_TIMEOUT')),remaining);})]);if(performance.now()-started>=timeoutMs)throw Error('HEALTH_TIMEOUT');if(!(bytes instanceof Uint8Array)||bytes.byteLength<=36||bytes.byteLength>MAX_PACKAGE_BYTES)throw Error('HEALTH_READ_UNVERIFIED');return Buffer.from(bytes);}finally{clearTimeout(timer);}}
 try{
  try{policy=validateBackupHealthPolicy(input);}catch{throw Error('HEALTH_POLICY_INVALID');}
  if(typeof readArchive!=='function'||typeof clock!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<5||timeoutMs>30000)throw Error('HEALTH_CONFIGURATION_INVALID');
  if(now()<policy.context.capturedAt)throw Error('HEALTH_FUTURE_CAPTURE');
  copy=await read();now();if(sha(copy)!==policy.archiveSha256)throw Error('HEALTH_ARCHIVE_MISMATCH');
  try{opened=openBackup(copy,key,policy.context);}catch{throw Error('HEALTH_AUTHENTICATION_UNVERIFIED');}
  if(performance.now()-started>=timeoutMs)throw Error('HEALTH_TIMEOUT');
  readback=await read();now();if(!copy.equals(readback)||sha(readback)!==policy.archiveSha256)throw Error('HEALTH_READBACK_MISMATCH');
  if(performance.now()-started>=timeoutMs)throw Error('HEALTH_TIMEOUT');
  const age=checkedAt-policy.context.capturedAt;if(!Number.isSafeInteger(age)||age<0)throw Error('HEALTH_FUTURE_CAPTURE');
  return age>policy.maxAgeMs?result('STALE','ARCHIVE_TOO_OLD',age):result('FRESH','AUTHENTICATED_READBACK_CURRENT',age);
 }catch(e){const allowed=['HEALTH_POLICY_INVALID','HEALTH_CONFIGURATION_INVALID','HEALTH_CLOCK_INVALID','HEALTH_FUTURE_CAPTURE','HEALTH_TIMEOUT','HEALTH_READ_UNVERIFIED','HEALTH_ARCHIVE_MISMATCH','HEALTH_AUTHENTICATION_UNVERIFIED','HEALTH_READBACK_MISMATCH'];return result('UNVERIFIED',allowed.includes(e?.message)?e.message:'HEALTH_READ_UNAVAILABLE');}
 finally{controller.abort();opened?.body?.fill(0);copy?.fill(0);readback?.fill(0);}
}
