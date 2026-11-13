// Read-only reconciliation of explicitly reviewed synthetic names. No retry/SQL/write path.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {syntheticPitrPlan} from './phase8d-synthetic-pitr.mjs';
const reviewedRuns = new Set(['20261111-c004458eeca590ce', '20261112-f28a8d6cb028d0bb']);
const sha = s => createHash('sha256').update(s).digest('hex');
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const uuid = s => typeof s === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
export async function reconcileSyntheticPitr({plan:input,token,request=fetch,timeoutMs=15000}) {
  const plan = syntheticPitrPlan(input);
  if (!reviewedRuns.has(plan.runId) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw Error('RECONCILIATION_SCOPE_REFUSED');
  const result = {format:'brick-synthetic-d1-reconciliation-v1',sourceSha:plan.sourceSha,runId:plan.runId,
    writeRequests:0,requestsMade:0,status:'BLOCKED',observations:[],originalMutationOutcome:'UNQUALIFIED_NO_RETRY',fullBrickRecoveryQualified:false};
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(token)) return {...result,code:'DEDICATED_READ_TOKEN_REQUIRED'};
  for (const name of plan.names) {
    const observation = {name,httpStatus:null,providerErrorCodes:[],exactMatches:[],searchComplete:false};
    result.observations.push(observation);
    const controller = new AbortController(); let timer, reader;
    const url = 'https://api.cloudflare.com/client/v4/accounts/' + plan.accountId + '/d1/database?name=' + encodeURIComponent(name) + '&page=1&per_page=100';
    try {
      result.requestsMade++;
      const work = (async()=>{
        const response = await request(url,{method:'GET',redirect:'error',signal:controller.signal,headers:{authorization:'Bearer '+token}});
        if(controller.signal.aborted) throw Error('READ_TIMEOUT');
        observation.httpStatus = response.status;
        if(response.redirected || response.url && response.url !== url || !response.body?.getReader) throw Error('READ_RESPONSE_REFUSED');
        reader=response.body.getReader();let length=0;const chunks=[];
        while(true){const part=await reader.read();if(controller.signal.aborted)throw Error('READ_TIMEOUT');if(part.done)break;length+=part.value.byteLength;if(length>65536)throw Error('READ_BODY_TOO_LARGE');chunks.push(Buffer.from(part.value));}
        let envelope;try{envelope=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('READ_RESPONSE_REFUSED');}
        if(Array.isArray(envelope?.errors))observation.providerErrorCodes=envelope.errors.map(e=>e?.code).filter(n=>Number.isSafeInteger(n)&&n>=1000&&n<=2147483647).slice(0,8);
        if(response.status!==200 || !object(envelope) || envelope.success!==true || !Array.isArray(envelope.errors) || envelope.errors.length || !Array.isArray(envelope.result)) throw Error('READ_RESPONSE_REFUSED');
        const info=envelope.result_info;
        // Preserve provider pagination metadata without inferring the account population or quota.
        if(!object(info)||info.page!==1||info.per_page!==100||info.count!==envelope.result.length||envelope.result.length>=100)throw Error('SEARCH_INCOMPLETE');
        if(Number.isSafeInteger(info.total_count)&&info.total_count>=0)observation.paginationTotalCountReported=info.total_count;
        if(envelope.result.some(d=>!object(d)||typeof d.name!=='string'||!uuid(d.uuid)))throw Error('READ_RESPONSE_REFUSED');
        const exact=envelope.result.filter(d=>d.name===name);
        if(exact.length>1)throw Error('AMBIGUOUS_TARGET');
        observation.exactMatches=exact.map(d=>({idSha256:sha(d.uuid),version:typeof d.version==='string'&&['production','alpha'].includes(d.version)?d.version:'UNQUALIFIED',createdAt:typeof d.created_at==='string'&&Number.isFinite(Date.parse(d.created_at))?new Date(d.created_at).toISOString():null}));
        observation.searchComplete=true;
        observation.state=exact.length?'EXACT_SYNTHETIC_NAME_OBSERVED_RETAIN_ISOLATED':'NO_EXACT_NAME_IN_COMPLETED_SEARCH';
      })();
      await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('READ_TIMEOUT'));},timeoutMs);})]);
    } catch(error) {
      const codes=['READ_TIMEOUT','READ_RESPONSE_REFUSED','READ_BODY_TOO_LARGE','SEARCH_INCOMPLETE','AMBIGUOUS_TARGET'];
      result.code=codes.includes(error?.message)?error.message:'READ_UNAVAILABLE';
      return result;
    } finally {clearTimeout(timer);controller.abort();try{reader?.cancel()?.catch(()=>{});}catch{}}
  }
  result.status='READ_ONLY_OBSERVATION_COMPLETED_NO_RETRY';
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),i=event.inputs;
    if(process.argv.length!==2 || process.env.GITHUB_EVENT_NAME!=='workflow_dispatch' || process.env.GITHUB_REF_NAME!=='audit/phase8d-d1-qualification'
       || i?.execute_new_synthetic_d1!=='false' || i.approved_source_sha!==process.env.GITHUB_SHA || !reviewedRuns.has(i.run_id))throw Error('EXACT_READ_ONLY_SCOPE_REQUIRED');
    const result=await reconcileSyntheticPitr({plan:{accountId:process.env.DRILL_ACCOUNT_ID,sourceSha:i.approved_source_sha,runId:i.run_id,rtoGoalSeconds:Number(i.rto_goal_seconds)},token:process.env.CLOUDFLARE_AUDIT_READ_TOKEN});
    console.log(JSON.stringify(result));process.exitCode=result.status==='READ_ONLY_OBSERVATION_COMPLETED_NO_RETRY'?0:2;
  } catch {console.error('Exact approved synthetic-name read-only reconciliation refused.');process.exitCode=1;}
}
