// Current D1-only beta metadata gate. Explicit dedicated read capability/pins only.
// Never dispatches itself or reads user rows, script content, logs, secrets, R2/Queues/Access.
import fs from 'node:fs';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';import {attestCardfreePitr} from './cardfree-pitr-readonly.mjs';
const API='https://api.cloudflare.com/client/v4',sha=x=>createHash('sha256').update(x).digest('hex'),record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),hex=(x,n)=>typeof x==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(x),uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x);
const exact=(x,keys)=>record(x)&&Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
export async function attestCardfreeBeta({token,plan,request=fetch,now=Date.now(),requestTimeoutMs=15000,totalTimeoutMs=90000,signal}={}){
 const result={format:'brick-cardfree-beta-readiness-v1',checkedAt:Number.isSafeInteger(now)&&now>0&&Number.isFinite(new Date(now).getTime())?new Date(now).toISOString():null,checksPassed:false,operationalRecoveryProven:false,installedWriterCoverageProven:false,independentCustodyProven:false,credentialLeastPrivilegeProven:false,executedCodeMatchesSourceProven:false,atomicCrossServiceSnapshotProven:false,activeVersionBindingMetadataVerified:false,requestsMade:0,checks:[]};
 const fail=(code,status='BLOCKED')=>{result.checks.push({status,code});return result;};
 if(typeof token!=='string'||!token.length)return fail('DEDICATED_READ_TOKEN_REQUIRED');
 const keys=['accountId','primaryId','diagnosticId','workerName','workerHost','expectedSourceSha','deviceNamespaceId','schedulerNamespaceId',...(plan&&Object.hasOwn(plan,'asOf')?['asOf']:[])];
 if(!exact(plan,keys)||!hex(plan.accountId,32)||!uuid(plan.primaryId)||!uuid(plan.diagnosticId)||plan.primaryId===plan.diagnosticId||plan.workerName!=='brick-family-beta'||typeof plan.workerHost!=='string'||!/^brick-family-beta\.[a-z0-9-]+\.workers\.dev$/.test(plan.workerHost)||!hex(plan.expectedSourceSha,40)||!hex(plan.deviceNamespaceId,32)||!hex(plan.schedulerNamespaceId,32)||plan.deviceNamespaceId===plan.schedulerNamespaceId||!result.checkedAt)return fail('PINNED_BETA_PLAN_REQUIRED');
 if(!Number.isSafeInteger(requestTimeoutMs)||requestTimeoutMs<5||requestTimeoutMs>15000||!Number.isSafeInteger(totalTimeoutMs)||totalTimeoutMs<5||totalTimeoutMs>90000||typeof request!=='function'||signal!==undefined&&!(signal instanceof AbortSignal))return fail('READ_CONFIGURATION_INVALID');
 if(plan.asOf!==undefined&&(typeof plan.asOf!=='string'||!plan.asOf.endsWith('Z')||!Number.isFinite(Date.parse(plan.asOf))||Date.parse(plan.asOf)>now||Date.parse(plan.asOf)<now-7*86400000))return fail('INVALID_CARD_FREE_HISTORY_TARGET');
 plan=Object.freeze({...plan});const deadline=performance.now()+totalTimeoutMs,prefix='/accounts/'+plan.accountId,worker=prefix+'/workers/scripts/'+plan.workerName,allowed=new Set([worker+'/deployments',worker+'/subdomain',prefix+'/workers/subdomain']);
 result.accountSha256=sha(plan.accountId);result.planSha256=sha(JSON.stringify(Object.fromEntries(Object.keys(plan).sort().map(k=>[k,plan[k]]))));
    async function get(path) {
        if(!allowed.has(path))throw Error('GET_PATH_REFUSED');
        const remaining = deadline - performance.now();
        if (signal?.aborted) throw Error('METADATA_CANCELLED');
        if (remaining <= 0) throw Error('METADATA_TIMEOUT');
        const callDeadline = performance.now() + Math.min(requestTimeoutMs, remaining), controller = new AbortController();
        let timer, reader, body, aborted, expired = false, taskSucceeded = false;
        const check = () => {
            if (signal?.aborted) throw Error('METADATA_CANCELLED');
            if (expired || performance.now() >= callDeadline) throw Error('METADATA_TIMEOUT');
        };
        // Cancellation is best effort: never await an arbitrary transport/stream cancel hook.
        const cancelled = new WeakSet();
        const discard = stream => {
            if (!stream || (typeof stream !== 'object' && typeof stream !== 'function') || cancelled.has(stream)) return;
            cancelled.add(stream);
            try { Promise.resolve(stream.cancel()).catch(() => {}); } catch {}
        };
        const task = async () => {
            check(); result.requestsMade++;
            const response = await request(API + path, { method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, redirect: 'error', signal: controller.signal });
            body = response?.body;
            check();
            if (response?.status === 401 || response?.status === 403) throw Error('READ_ACCESS_DENIED');
            if(response?.status!==200||!response?.ok||response.redirected||response.url&&response.url!==API+path||!body) throw Error('METADATA_UNAVAILABLE');
            reader = body.getReader();
            const parts = []; let size = 0;
            for (;;) {
                check();
                const r = await reader.read();
                check();
                if (r.done) break;
                if (!(r.value instanceof Uint8Array)) throw Error('METADATA_SHAPE');
                size += r.value.byteLength;
                if (size > 65536) throw Error('METADATA_ENVELOPE');
                parts.push(Buffer.from(r.value));
            }
            let data;
            try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts, size))); }
            catch { throw Error('METADATA_SHAPE'); }
            check();
            if(response.redirected||response.url&&response.url!==API+path||!record(data)||data.success!==true||!record(data.result)) throw Error('METADATA_SHAPE');
            taskSucceeded = true;
            return data.result;
        };
        const stop = new Promise((_, reject) => {
            timer = setTimeout(() => { expired = true; reject(Error('METADATA_TIMEOUT')); controller.abort(); }, Math.max(0, callDeadline - performance.now()));
            aborted = () => { reject(Error('METADATA_CANCELLED')); controller.abort(); };
            signal?.addEventListener('abort', aborted, { once: true });
        });
        let completed = false;
        const work = task().finally(() => {
            // Runs for late responses/reads as well. Never process a late failed result as proof.
            if (!taskSucceeded) {
                discard(reader ?? body);
            }
            try { reader?.releaseLock(); } catch {}
        });
        try {
            const value = await Promise.race([work, stop]);
            check(); completed = true;
            return value;
        } finally {
            clearTimeout(timer); signal?.removeEventListener('abort', aborted);
            if (!completed) {
                controller.abort();
                discard(reader ?? body);
            }
        }
    }
 const drift=code=>{throw Error(code);};
 const deployment=data=>{const d=data?.deployments?.[0];if(!record(d)||!uuid(d.id)||d.strategy!=='percentage'||!Array.isArray(d.versions)||d.versions.length!==1||d.versions[0].percentage!==100||!uuid(d.versions[0].version_id))drift('SINGLE_ACTIVE_VERSION_REQUIRED');return{id:d.id,versionId:d.versions[0].version_id};};
 try{
  const active=deployment(await get(worker+'/deployments'));allowed.add(worker+'/versions/'+active.versionId);
  const version=await get(worker+'/versions/'+active.versionId);if(version.id!==active.versionId||!record(version.resources)||!Array.isArray(version.resources.bindings))drift('ACTIVE_VERSION_METADATA_MISMATCH');
  const bindings=version.resources.bindings;if(bindings.some(b=>!record(b)||typeof b.name!=='string'||typeof b.type!=='string')||new Set(bindings.map(b=>b.name)).size!==bindings.length)drift('ACTIVE_BINDINGS_UNAVAILABLE');
  const selected=name=>bindings.find(b=>b.name===name),text=(name,value)=>{const b=selected(name);if(b?.type!=='plain_text'||b.text!==value)drift('BETA_MODE_OR_SOURCE_DRIFT');};
  for(const [name,value]of Object.entries({APP_ENV:'development',BETA_CHANNEL:'beta',DEV_PARENT_AUTH_MODE:'d1-session-v1',BETA_STORAGE_MODE:'d1',BETA_SOURCE_SHA:plan.expectedSourceSha}))text(name,value);
  for(const [name,id]of [['DB',plan.primaryId],['BETA_DB',plan.diagnosticId]]){const b=selected(name);if(b?.type!=='d1'||b.id!==id)drift('ACTIVE_D1_BINDING_DRIFT');}
  for(const [name,id]of [['BRICK_DEVICE',plan.deviceNamespaceId],['BETA_SCHEDULER',plan.schedulerNamespaceId]]){const b=selected(name);if(b?.type!=='durable_object_namespace'||b.namespace_id!==id)drift('ACTIVE_DO_BINDING_DRIFT');}
  if(bindings.filter(b=>b.type==='d1').length!==2||bindings.filter(b=>b.type==='durable_object_namespace').length!==2)drift('UNCLASSIFIED_STORAGE_BINDING');
  if(bindings.some(b=>['r2_bucket','queue'].includes(b.type)))drift('UNEXPECTED_LEGACY_STORAGE_BINDING');
  result.active={deploymentSha256:sha(active.id),versionSha256:sha(active.versionId),sourceSha:plan.expectedSourceSha,primarySha256:sha(plan.primaryId),diagnosticSha256:sha(plan.diagnosticId),deviceNamespaceSha256:sha(plan.deviceNamespaceId),schedulerNamespaceSha256:sha(plan.schedulerNamespaceId)};
  result.checks.push({status:'ATTESTED',code:'ACTIVE_D1_BETA_VERSION_AND_BINDINGS'});
  const domain=await get(prefix+'/workers/subdomain'),enabled=await get(worker+'/subdomain');if(typeof domain.subdomain!=='string'||plan.workerName+'.'+domain.subdomain+'.workers.dev'!==plan.workerHost||enabled.enabled!==true)drift('WORKERS_DEV_HOST_DRIFT');
  result.workerHostSha256=sha(plan.workerHost);result.checks.push({status:'ATTESTED',code:'PINNED_WORKERS_DEV_HOST'});
  const remaining=Math.floor(deadline-performance.now());if(remaining<5)throw Error('METADATA_TIMEOUT');
  const pitrAllowed=new Set([plan.primaryId,plan.diagnosticId].flatMap(id=>[API+prefix+'/d1/database/'+id,API+prefix+'/d1/database/'+id+'/time_travel/bookmark',...(plan.asOf===undefined?[]:[API+prefix+'/d1/database/'+id+'/time_travel/bookmark?timestamp='+encodeURIComponent(new Date(plan.asOf).toISOString())])]));
  let pitrRequests=0;const pitr=await attestCardfreePitr({token,plan:{accountId:plan.accountId,primaryId:plan.primaryId,diagnosticId:plan.diagnosticId,...(plan.asOf===undefined?{}:{asOf:plan.asOf})},request:(url,init)=>{if(!pitrAllowed.has(url)||init?.method!=='GET'||init?.redirect!=='error'||init.body!==undefined)throw Error('GET_PATH_REFUSED');pitrRequests++;return request(url,init);},now,requestTimeoutMs,totalTimeoutMs:remaining,signal});result.requestsMade+=pitrRequests;result.pitr=pitr;
  if(!pitr.checksPassed){result.checks.push({status:'BLOCKED',code:'D1_IDENTITY_OR_BOOKMARK_UNQUALIFIED'});return result;}
  const after=deployment(await get(worker+'/deployments'));if(after.id!==active.id||after.versionId!==active.versionId)drift('ACTIVE_DEPLOYMENT_CHANGED_DURING_READ');
  result.checks.push({status:'ATTESTED',code:'D1_BOOKMARK_METADATA_AND_MATCHING_DEPLOYMENT_READS'});result.activeVersionBindingMetadataVerified=true;result.checksPassed=true;return result;
 }catch(e){const known=['SINGLE_ACTIVE_VERSION_REQUIRED','ACTIVE_VERSION_METADATA_MISMATCH','ACTIVE_BINDINGS_UNAVAILABLE','BETA_MODE_OR_SOURCE_DRIFT','ACTIVE_D1_BINDING_DRIFT','ACTIVE_DO_BINDING_DRIFT','UNEXPECTED_LEGACY_STORAGE_BINDING','UNCLASSIFIED_STORAGE_BINDING','WORKERS_DEV_HOST_DRIFT','ACTIVE_DEPLOYMENT_CHANGED_DURING_READ'];return fail(known.includes(e?.message)?e.message:['READ_ACCESS_DENIED','METADATA_TIMEOUT','METADATA_CANCELLED','METADATA_ENVELOPE','METADATA_SHAPE'].includes(e?.message)?e.message:'METADATA_UNAVAILABLE',known.includes(e?.message)?'DRIFT':'BLOCKED');}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        if (process.argv.length !== 3)
            throw Error('private plan required');
        if (typeof fs.constants.O_NOFOLLOW !== 'number' || typeof fs.constants.O_NONBLOCK !== 'number') throw Error('private plan required');
        const fd = fs.openSync(process.argv[2], fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        let plan;
        try {
            const stat = fs.fstatSync(fd);
            if (!stat.isFile() || stat.nlink!==1 || typeof process.geteuid==='function'&&stat.uid!==process.geteuid() || stat.size > 16384 || (stat.mode & 0o077))
                throw Error('private plan required');
            const bytes = Buffer.alloc(stat.size); let offset = 0;
            while (offset < bytes.length) { const n = fs.readSync(fd, bytes, offset, bytes.length - offset, null); if (!n) throw Error('private plan required'); offset += n; }
            if (fs.readSync(fd, Buffer.alloc(1), 0, 1, null)) throw Error('private plan changed');
            const after = fs.fstatSync(fd);
            if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw Error('private plan changed');
            plan = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        }
        finally {
            fs.closeSync(fd);
        }
        const result = await attestCardfreeBeta({ token: process.env.CLOUDFLARE_AUDIT_READ_TOKEN, plan });
        console.log(JSON.stringify(result));
        if (!result.checksPassed)
            process.exitCode = 2;
    }
    catch {
        console.error('Beta metadata check requires a private pinned plan and dedicated read capability; no recovery is authorized.');
        process.exitCode = 1;
    }
}
