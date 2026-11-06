/**
 * Phase 2 operational observations: a privacy-reduced *view* of existing signed beta
 * endurance observations. This is NOT the Android device's full DiagnosticStore.
 * Beta evidence retains its independent retention and is never deleted here.
 */
export type OpsEnv = { DB: D1Database; BETA_DB: D1Database };
const MAX_LIMIT = 100;
const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000;
type SourceRow = {run_id:string;record_id:number;payload:string;received_at:number};
type Health = Record<string,unknown>;
type Observation = {wallMs?:number;bootChanged?:boolean;sameBootGapMs?:number|null;clockDeltaMs?:number;health?:Health};

export function singaporeOpsWindowStart(now:number):number {
 if(!Number.isSafeInteger(now)||now<0)throw new Error('invalid_time');
 const d=new Date(now+SINGAPORE_OFFSET_MS);
 return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-6)-SINGAPORE_OFFSET_MS;
}

function opsSeverity(o:Observation):'INFO'|'WARN'|'ERROR' {
 const h=o.health||{};
 if(h.journalWriteHealthy===false)return 'ERROR';
 if(o.bootChanged||Number(o.sameBootGapMs||0)>180000||Math.abs(Number(o.clockDeltaMs||0))>5000)return 'WARN';
 if(h.locationEnabled===false||h.locationSubscribed===false||h.networkValidated===false)return 'WARN';
 if(Number(h.pendingRecords||0)>100||Number(h.ackAgeMs||0)>120000)return 'WARN';
 return 'INFO';
}

function opsReason(o:Observation):string {
 const h=o.health||{};
 if(h.journalWriteHealthy===false)return 'journal_write_unhealthy';
 if(o.bootChanged)return 'phone_reboot_observed';
 if(Number(o.sameBootGapMs||0)>180000)return 'observation_gap';
 if(Math.abs(Number(o.clockDeltaMs||0))>5000)return 'device_clock_changed';
 if(h.locationEnabled===false)return 'location_disabled';
 if(h.locationSubscribed===false)return 'location_subscription_missing';
 if(h.networkValidated===false)return 'network_unvalidated';
 if(Number(h.pendingRecords||0)>100)return 'location_backlog';
 if(Number(h.ackAgeMs||0)>120000)return 'upload_ack_delayed';
 return 'health_observation';
}

const WHITELIST = ['serviceUptimeMs','locationAgeMs','locationCallbackAgeMs','ackAgeMs','pendingRecords','pendingSafetyEvents','oldestPendingAgeMs','network','networkValidated','locationEnabled','locationSubscribed','batteryPct','charging','activityMode','trackingIntervalMs','recoveryCount','healthSequence','journalWriteHealthy'];
function publicDetails(o:Observation) {
 const h=o.health||{},out:Record<string,unknown>={};
 for(const k of WHITELIST){const v=h[k];if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=80)out[k]=v;}
 out.bootChanged=o.bootChanged===true;
 if(typeof o.sameBootGapMs==='number'&&Number.isFinite(o.sameBootGapMs))out.sameBootGapMs=o.sameBootGapMs;
 if(typeof o.clockDeltaMs==='number'&&Number.isFinite(o.clockDeltaMs))out.clockDeltaMs=o.clockDeltaMs;
 return out;
}

/**
 * Caller MUST validate private parent session and parent rate limit before invoking.
 * Absence of observations is not evidence that the phone was healthy.
 */
export async function readParentOperationalLogs(env:OpsEnv,deviceId:string,params:URLSearchParams,now=Date.now()):Promise<Response>{
 const respond=(obj:unknown,status=200)=>Response.json(obj,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(deviceId))return respond({error:'invalid_device'},400);
 const life=await env.DB.prepare('SELECT revoked_at FROM devices WHERE id=?1').bind(deviceId).first<{revoked_at:number|null}>();
 if(!life||life.revoked_at!==null)return respond({error:'device_unavailable'},404);
 const limit=Number(params.get('limit')||50),offset=Number(params.get('offset')||0);
 if(!Number.isSafeInteger(limit)||limit<1||limit>MAX_LIMIT||!Number.isSafeInteger(offset)||offset<0||offset>5000)return respond({error:'invalid_pagination'},400);
 const from=singaporeOpsWindowStart(now);
 const rows=await env.BETA_DB.prepare('SELECT run_id,record_id,payload,received_at FROM beta_records WHERE device_id=?1 AND received_at>=?2 AND received_at<=?3 ORDER BY received_at DESC,run_id DESC,record_id DESC LIMIT ?4 OFFSET ?5')
   .bind(deviceId,from,now,limit+1,offset).all<SourceRow>();
 const items=rows.results.slice(0,limit).flatMap(row=>{
  let o:Observation;try{o=JSON.parse(row.payload) as Observation;}catch{return [];}
  if(!o||typeof o!=='object'||!Number.isSafeInteger(o.wallMs)||o.wallMs!<from||o.wallMs!>now+120000)return [];
  return [{id:row.run_id+':'+row.record_id,source:'phone_beta_observation',severity:opsSeverity(o),eventCode:opsReason(o),capturedAt:o.wallMs,receivedAt:row.received_at,detail:publicDetails(o)}];
 });
 return respond({items,offset,nextOffset:rows.results.length>limit?offset+limit:null,retainedFrom:from,retainedThrough:now,timezone:'Asia/Singapore',dataSource:'signed_beta_observations_only',androidDiagnosticStoreUploaded:false,note:'Only signed beta-test observations are available. Android local diagnostic logs are not yet uploaded. Historical beta test evidence has separate retention.'});
}
