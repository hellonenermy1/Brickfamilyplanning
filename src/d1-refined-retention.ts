// D1-only retention. A successful bounded delete is its own durable progress;
// source rows are removed atomically with unchanged, unreferenced object metadata.
const DAY=86400000,PAGE=8,ENDPOINT_PAGE=256;
type Row={device_id:string;id:string;key:string|null;age:number;etag:string|null;uploaded:number|null};
export async function cleanupD1RefinedHistory(db:D1Database,now:number,limit:number){
 if(!Number.isSafeInteger(now)||now<=0||!Number.isSafeInteger(limit)||limit<1)throw Error('invalid refined cleanup bounds');
 const n=Math.min(PAGE,limit),frameCutoff=now-30*DAY,runCutoff=now-90*DAY;
 const frames=(await db.prepare("SELECT f.device_id,f.record_id id,f.r2_key key,f.created_at age,o.etag,o.uploaded_at uploaded FROM phase5_hypothesis_frames f LEFT JOIN dev_object_store o ON o.key=f.r2_key WHERE f.created_at<?1 ORDER BY f.created_at,f.device_id,f.record_id LIMIT ?2").bind(frameCutoff,n).all<Row>()).results;
 const runs=(await db.prepare("SELECT r.device_id,r.id,r.refined_r2_key key,r.to_ms age,o.etag,o.uploaded_at uploaded FROM phase5_refined_intervals r LEFT JOIN dev_object_store o ON o.key=r.refined_r2_key WHERE r.to_ms<?1 ORDER BY r.to_ms,r.id LIMIT ?2").bind(runCutoff,n).all<Row>()).results;
 for(const [rows,prefix]of [[frames,'history/hypotheses/'],[runs,'history/refined/']] as const)for(const r of rows){
  if(typeof r.device_id!=='string'||typeof r.id!=='string'||!Number.isSafeInteger(r.age)||(r.key!==null&&(typeof r.key!=='string'||!r.key.startsWith(prefix)||r.key.length>1024)))throw Error('invalid refined cleanup reference');
 }
 const frameJson=JSON.stringify(frames),runJson=JSON.stringify(runs),allJson=JSON.stringify([...frames,...runs]);
 const result=await db.batch([
  db.prepare("DELETE FROM phase5_hypothesis_frames WHERE (device_id,record_id) IN(SELECT json_extract(value,'$.device_id'),json_extract(value,'$.id') FROM json_each(?1)) AND EXISTS(SELECT 1 FROM json_each(?1) s WHERE phase5_hypothesis_frames.device_id=json_extract(s.value,'$.device_id') AND phase5_hypothesis_frames.record_id=json_extract(s.value,'$.id') AND phase5_hypothesis_frames.r2_key IS json_extract(s.value,'$.key') AND phase5_hypothesis_frames.created_at=json_extract(s.value,'$.age')) AND created_at<?2").bind(frameJson,frameCutoff),
  db.prepare("DELETE FROM phase5_refined_intervals WHERE id IN(SELECT json_extract(value,'$.id') FROM json_each(?1)) AND EXISTS(SELECT 1 FROM json_each(?1) s WHERE phase5_refined_intervals.device_id=json_extract(s.value,'$.device_id') AND phase5_refined_intervals.id=json_extract(s.value,'$.id') AND phase5_refined_intervals.refined_r2_key IS json_extract(s.value,'$.key') AND phase5_refined_intervals.to_ms=json_extract(s.value,'$.age')) AND to_ms<?2").bind(runJson,runCutoff),
  // FK CASCADE owns chunks. Refreshed versions and any still-referenced shared
  // key survive this transaction, even if the source reference changed after selection.
  db.prepare("DELETE FROM dev_object_store WHERE key IN(SELECT json_extract(value,'$.key') FROM json_each(?1)) AND EXISTS(SELECT 1 FROM json_each(?1) s WHERE dev_object_store.key=json_extract(s.value,'$.key') AND dev_object_store.etag=json_extract(s.value,'$.etag') AND dev_object_store.uploaded_at=json_extract(s.value,'$.uploaded')) AND NOT EXISTS(SELECT 1 FROM phase5_hypothesis_frames f WHERE f.r2_key=dev_object_store.key) AND NOT EXISTS(SELECT 1 FROM phase5_refined_intervals r WHERE r.refined_r2_key=dev_object_store.key)").bind(allJson),
  db.prepare("DELETE FROM phase5_precise_endpoints WHERE rowid IN(SELECT rowid FROM phase5_precise_endpoints WHERE created_at<?1 ORDER BY created_at,rowid LIMIT ?2)").bind(frameCutoff,ENDPOINT_PAGE)
 ]);
 const pending=await db.prepare("SELECT EXISTS(SELECT 1 FROM phase5_hypothesis_frames WHERE created_at<?1) OR EXISTS(SELECT 1 FROM phase5_refined_intervals WHERE to_ms<?2) OR EXISTS(SELECT 1 FROM phase5_precise_endpoints WHERE created_at<?1) AS pending").bind(frameCutoff,runCutoff).first<{pending:number}>();
 return{hypothesisFramesDeleted:Number(result[0].meta.changes),refinedRunsDeleted:Number(result[1].meta.changes),preciseEndpointsDeleted:Number(result[3].meta.changes),complete:Number(pending?.pending)===0};
}
