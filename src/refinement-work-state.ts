// Reconstructible D1 operational state. provider_cache is deliberately excluded
// from disaster archives; signed evidence and pending input rows remain durable.
export const FRAME_FAILURE_PROVIDER = 'brick_refinement_failure_v1';
const CURSOR_PROVIDER = 'brick_refinement_frame_cursor_v1';
export const REFINEMENT_PAGE_SIZE = 8;
export type PendingFrame = {record_id:string;wall_time_ms:number;r2_key:string};
type Failure = {v:1;status:'FAILED'|'QUARANTINED';attempts:number;firstFailedAt:number;lastFailedAt:number;nextAttemptAt:number|null;errorCode:'refinement_input_unavailable'};
export class RefinementInputsUnavailable extends Error { constructor(){super('refinement inputs unavailable');} }
function identity(deviceId:string,recordId?:string){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(deviceId)||(recordId!==undefined&&!/^[A-Za-z0-9._:-]{1,128}$/.test(recordId)))throw Error('invalid refinement work identity');
  return recordId===undefined?deviceId:deviceId+'/'+recordId;
}
function decode(value:string):Failure{
  let r:Failure;try{r=JSON.parse(value);}catch{throw Error('invalid refinement failure receipt');}
  if(!r||Object.keys(r).sort().join(',')!=='attempts,errorCode,firstFailedAt,lastFailedAt,nextAttemptAt,status,v'||r.v!==1||
    !['FAILED','QUARANTINED'].includes(r.status)||!Number.isInteger(r.attempts)||r.attempts<1||r.attempts>3||
    !Number.isSafeInteger(r.firstFailedAt)||r.firstFailedAt<=0||!Number.isSafeInteger(r.lastFailedAt)||r.lastFailedAt<r.firstFailedAt||
    r.errorCode!=='refinement_input_unavailable'||(r.status==='QUARANTINED'?r.attempts!==3||r.nextAttemptAt!==null:r.attempts>=3||!Number.isSafeInteger(r.nextAttemptAt)||(r.nextAttemptAt as number)<=r.lastFailedAt))throw Error('invalid refinement failure receipt');
  return r;
}
export async function selectRefinementFrames(db:D1Database,deviceId:string,now:number):Promise<PendingFrame[]>{
  identity(deviceId);
  const saved=await db.prepare('SELECT value_json FROM provider_cache WHERE provider=?1 AND cache_key=?2').bind(CURSOR_PROVIDER,deviceId).first<{value_json:string}>();
  let cursor:{wallTimeMs:number;recordId:string}|null=null;
  if(saved){try{const v=JSON.parse(saved.value_json);if(Number.isSafeInteger(v.wallTimeMs)&&v.wallTimeMs>0&&typeof v.recordId==='string'){identity(deviceId,v.recordId);cursor=v;}}catch{throw Error('invalid refinement cursor');}if(!cursor)throw Error('invalid refinement cursor');}
  async function select(wrap:boolean,limit:number){
    const relation=wrap?'(wall_time_ms<?4 OR (wall_time_ms=?4 AND record_id<=?5))':'(wall_time_ms>?4 OR (wall_time_ms=?4 AND record_id>?5))';
    return(await db.prepare('SELECT record_id,wall_time_ms,r2_key FROM phase5_hypothesis_frames WHERE device_id=?1 AND refined_run_id IS NULL AND created_at>=?3 '+
      'AND EXISTS(SELECT 1 FROM devices WHERE id=?1 AND revoked_at IS NULL) AND '+relation+' ORDER BY wall_time_ms,record_id LIMIT ?2')
      .bind(deviceId,limit,now-30*86_400_000,cursor?.wallTimeMs??0,cursor?.recordId??'').all<PendingFrame>()).results;
  }
  const rows=await select(false,REFINEMENT_PAGE_SIZE);
  if(cursor&&rows.length<REFINEMENT_PAGE_SIZE)rows.push(...await select(true,REFINEMENT_PAGE_SIZE-rows.length));
  if(rows.length){const last=rows[rows.length-1];identity(deviceId,last.record_id);await db.prepare('INSERT INTO provider_cache(provider,cache_key,value_json,expires_at,updated_at) VALUES(?1,?2,?3,?4,?5) '+
    'ON CONFLICT(provider,cache_key) DO UPDATE SET value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at')
    .bind(CURSOR_PROVIDER,deviceId,JSON.stringify({wallTimeMs:last.wall_time_ms,recordId:last.record_id}),now+30*86_400_000,now).run();}
  return rows.sort((a,b)=>a.wall_time_ms-b.wall_time_ms||a.record_id.localeCompare(b.record_id));
}
export async function loadFrameFailures(db:D1Database,deviceId:string,rows:PendingFrame[]){
  const result=new Map<string,{serialized:string;state:Failure}>();if(!rows.length)return result;
  const keys=rows.map(r=>identity(deviceId,r.record_id));
  const values=await db.prepare('SELECT cache_key,value_json FROM provider_cache WHERE provider=?1 AND cache_key IN ('+keys.map((_,i)=>'?'+(i+2)).join(',')+')')
    .bind(FRAME_FAILURE_PROVIDER,...keys).all<{cache_key:string;value_json:string}>();
  for(const row of values.results)result.set(row.cache_key,{serialized:row.value_json,state:decode(row.value_json)});
  return result;
}
type Endpoint={epoch:number;sequence:number;wall_time_ms:number;latitude:number;longitude:number;uncertainty_m:number};
export async function loadFrameEndpointPairs(db:D1Database,deviceId:string,frames:PendingFrame[]){
  const result=new Map<string,{before:Endpoint|null;after:Endpoint|null}>();if(!frames.length)return result;
  // At most two indexed endpoint seeks per selected frame; no unbounded scan
  // across a wrapped page's entire30-day time range.
  const columns=['epoch','sequence','wall_time_ms','latitude','longitude','uncertainty_m'];
  const fields=['b','a'].flatMap(prefix=>columns.map(c=>prefix+'.'+c+' '+prefix+'_'+c));
  const rows=await db.prepare('SELECT f.record_id,'+fields.join(',')+' FROM phase5_hypothesis_frames f '+
    'LEFT JOIN phase5_precise_endpoints b ON b.rowid=(SELECT p.rowid FROM phase5_precise_endpoints p WHERE p.device_id=f.device_id AND p.wall_time_ms<f.wall_time_ms ORDER BY p.wall_time_ms DESC,p.epoch DESC,p.sequence DESC LIMIT 1) '+
    'LEFT JOIN phase5_precise_endpoints a ON a.rowid=(SELECT p.rowid FROM phase5_precise_endpoints p WHERE p.device_id=f.device_id AND p.wall_time_ms>f.wall_time_ms ORDER BY p.wall_time_ms,p.epoch,p.sequence LIMIT 1) '+
    'WHERE f.device_id=?1 AND f.record_id IN ('+frames.map((_,i)=>'?'+(i+2)).join(',')+')')
    .bind(deviceId,...frames.map(f=>f.record_id)).all<Record<string,string|number|null>>();
  for(const row of rows.results){const value=(prefix:string):Endpoint|null=>row[prefix+'_epoch']===null?null:Object.fromEntries(columns.map(c=>[c,Number(row[prefix+'_'+c])])) as Endpoint;
    result.set(String(row.record_id),{before:value('b'),after:value('a')});}
  return result;
}
export async function recordFrameFailure(db:D1Database,deviceId:string,recordId:string,previous:{serialized:string;state:Failure}|undefined,now:number){
  const attempts=Math.min(3,(previous?.state.attempts??0)+1),state:Failure={v:1,status:attempts===3?'QUARANTINED':'FAILED',attempts,
    firstFailedAt:previous?.state.firstFailedAt??now,lastFailedAt:now,nextAttemptAt:attempts===3?null:now+60_000*2**(attempts-1),errorCode:'refinement_input_unavailable'};
  const write=await db.prepare('INSERT INTO provider_cache(provider,cache_key,value_json,expires_at,updated_at) '+
    'SELECT ?1,?2,?3,?4,?5 WHERE EXISTS(SELECT 1 FROM devices WHERE id=?6 AND revoked_at IS NULL) '+
    'AND (?7 IS NULL OR EXISTS(SELECT 1 FROM provider_cache WHERE provider=?1 AND cache_key=?2 AND value_json=?7)) '+
    'ON CONFLICT(provider,cache_key) DO UPDATE SET value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at WHERE provider_cache.value_json=?7')
    .bind(FRAME_FAILURE_PROVIDER,identity(deviceId,recordId),JSON.stringify(state),now+30*86_400_000,now,deviceId,previous?.serialized??null).run();
  if(Number(write.meta.changes)!==1)throw Error('refinement failure ownership changed');
}
export async function clearFrameFailure(db:D1Database,deviceId:string,recordId:string,previous?:string){
  await db.prepare('DELETE FROM provider_cache WHERE provider=?1 AND cache_key=?2'+(previous===undefined?'':' AND value_json=?3'))
    .bind(FRAME_FAILURE_PROVIDER,identity(deviceId,recordId),...(previous===undefined?[]:[previous])).run();
}
export async function refinementFrameStatus(db:D1Database,deviceId:string){
  identity(deviceId);
  const rows=await db.prepare('SELECT p.value_json FROM provider_cache p JOIN phase5_hypothesis_frames f ON p.cache_key=f.device_id||\'/\'||f.record_id '+
    'WHERE p.provider=?1 AND f.device_id=?2 AND f.refined_run_id IS NULL AND f.created_at>=?3 LIMIT 1001').bind(FRAME_FAILURE_PROVIDER,deviceId,Date.now()-30*86_400_000).all<{value_json:string}>();
  let failed=0,quarantined=0;for(const row of rows.results){const state=decode(row.value_json);if(state.status==='QUARANTINED')quarantined++;else failed++;}
  return{failedFrames:failed,quarantinedFrames:quarantined,truncated:rows.results.length>1000,assessment:'OPERATIONAL_NOT_ARCHIVED' as const};
}
