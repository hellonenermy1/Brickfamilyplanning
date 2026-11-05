import {unpackPacket} from './dev-free-runtime';
import {commuteDistance,commuteMode,commuteMoving,commuteId,type CommutePoint} from './commute-geometry';
const PROVIDER='brick_commute_scan_v1',DAY=86400000;
export const COMMUTE_PAGE_ROWS=256,COMMUTE_PAGES_PER_SLICE=2;
const MAX_POINTS=1_000_000,MAX_SUMMARIES=1024,MAX_STATE_BYTES=768_000;
type Cursor={wall:number;sequence:number;epoch:number};
type Segment={start:number;last:CommutePoint;count:number;distance:number;modes:Record<string,{n:number;confidence:number}>;stationarySince:number|null};
type Summary={id:string;start:number;end:number;distance:number;duration:number;mode:string;confidence:number};
type Scan={format:'brick_commute_scan_v1';deviceId:string;jobId:string;fromMs:number;toMs:number;capturedAt:number;highWater:number;cursor:Cursor|null;seen:number;segment:Segment|null;candidates:Summary[];complete:boolean;lastPublishedAt:number|null};
const record=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function exact(x:unknown,keys:string[]):x is Record<string,unknown>{return record(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');}
function safe(x:unknown,min=0):x is number{return typeof x==='number'&&Number.isSafeInteger(x)&&x>=min;}
function pointValid(p:unknown):p is CommutePoint{
 if(!record(p)||!safe(p.wallTimeMs)||!safe(p.uncertaintyCm)||!safe(p.activity)||p.activity>255||!safe(p.activityConfidence)||p.activityConfidence>100||
 !(p.speedCms===null||safe(p.speedCms))||typeof p.rawAccepted!=='boolean'||typeof p.fallback!=='boolean')return false;
 return (p.trustedLatE7===null&&p.trustedLonE7===null)||(safeCoord(p.trustedLatE7,900000000)&&safeCoord(p.trustedLonE7,1800000000));
}
function safeCoord(x:unknown,bound:number):x is number{return typeof x==='number'&&Number.isSafeInteger(x)&&Math.abs(x)<=bound;}
function cursorValid(c:unknown):c is Cursor{return exact(c,['wall','sequence','epoch'])&&safe(c.wall)&&safe(c.sequence)&&safe(c.epoch);}
function validate(scan:unknown,deviceId:string):asserts scan is Scan{
 if(!exact(scan,['format','deviceId','jobId','fromMs','toMs','capturedAt','highWater','cursor','seen','segment','candidates','complete','lastPublishedAt'])||
 scan.format!==PROVIDER||scan.deviceId!==deviceId||typeof scan.jobId!=='string'||!/^[a-f0-9-]{36}$/.test(scan.jobId)||!safe(scan.fromMs)||!safe(scan.toMs)||
 scan.toMs<scan.fromMs||scan.toMs-scan.fromMs>2*DAY||!safe(scan.capturedAt,1)||!safe(scan.highWater)||!safe(scan.seen)||scan.seen>MAX_POINTS||
 !(scan.cursor===null||cursorValid(scan.cursor))||typeof scan.complete!=='boolean'||!(scan.lastPublishedAt===null||safe(scan.lastPublishedAt,1))||
 !Array.isArray(scan.candidates)||scan.candidates.length>MAX_SUMMARIES)throw Error('invalid commute checkpoint');
 if(scan.cursor&&(scan.cursor.wall<scan.fromMs||scan.cursor.wall>scan.toMs))throw Error('invalid commute cursor');
 if(scan.segment!==null){const s=scan.segment;if(!exact(s,['start','last','count','distance','modes','stationarySince'])||!safe(s.start)||!pointValid(s.last)||!safe(s.count,1)||s.count>MAX_POINTS||
 typeof s.distance!=='number'||!Number.isFinite(s.distance)||s.distance<0||s.last.wallTimeMs<s.start||!record(s.modes)||Object.keys(s.modes).length>4||
 !(s.stationarySince===null||safe(s.stationarySince)))throw Error('invalid commute segment');
 for(const [mode,v]of Object.entries(s.modes)){if(!['walking','running','bicycle','vehicle'].includes(mode)||!exact(v,['n','confidence'])||!safe(v.n,1)||v.n>s.count||typeof v.confidence!=='number'||!Number.isFinite(v.confidence)||v.confidence<0||v.confidence>100*v.n)throw Error('invalid commute mode state');}}
 const ids=new Set<string>();for(const v of scan.candidates){if(!exact(v,['id','start','end','distance','duration','mode','confidence'])||typeof v.id!=='string'||!/^comm_[a-f0-9]{32}$/.test(v.id)||ids.has(v.id)||!safe(v.start)||!safe(v.end)||v.start<scan.fromMs||v.end>scan.toMs||v.end-v.start<180000||v.duration!==v.end-v.start||!safe(v.distance,200)||!['walking','running','bicycle','vehicle','unknown'].includes(String(v.mode))||typeof v.confidence!=='number'||!Number.isFinite(v.confidence)||v.confidence<0||v.confidence>1)throw Error('invalid commute candidate');ids.add(v.id);}
}
function decode(value:string,deviceId:string):Scan{if(value.length>MAX_STATE_BYTES)throw Error('commute checkpoint byte limit');let parsed:unknown;try{parsed=JSON.parse(value);}catch{throw Error('invalid commute checkpoint');}validate(parsed,deviceId);return parsed;}
function compare(a:Cursor,b:Cursor){return a.wall-b.wall||a.sequence-b.sequence||a.epoch-b.epoch;}
async function active(db:D1Database,deviceId:string){if(!/^[A-Za-z0-9_-]{1,128}$/.test(deviceId)||!await db.prepare('SELECT 1 AS ok FROM devices WHERE id=?1 AND revoked_at IS NULL').bind(deviceId).first())throw Error('commute device unavailable');}
async function startScan(db:D1Database,deviceId:string,fromMs:number,toMs:number,lastPublishedAt:number|null):Promise<Scan>{
 const capturedAt=Date.now(),water=await db.prepare('SELECT COALESCE(MAX(rowid),0) n FROM dev_location_history WHERE device_id=?1').bind(deviceId).first<{n:number}>();
 if(!water||!safe(water.n))throw Error('invalid commute history watermark');
 return{format:PROVIDER,deviceId,jobId:crypto.randomUUID(),fromMs,toMs,capturedAt,highWater:water.n,cursor:null,seen:0,segment:null,candidates:[],complete:false,lastPublishedAt};
}
async function readPage(db:D1Database,scan:Scan){
 const c=scan.cursor??{wall:-1,sequence:0,epoch:0};
 const rows=(await db.prepare('SELECT epoch,sequence,wall_time_ms,trusted_packet_json FROM dev_location_history WHERE device_id=?1 AND wall_time_ms>=?2 AND wall_time_ms<=?3 '+
 'AND rowid<=?4 AND created_at<=?5 AND created_at>=?6 AND (wall_time_ms>?7 OR (wall_time_ms=?7 AND (sequence>?8 OR (sequence=?8 AND epoch>?9)))) '+
 'ORDER BY wall_time_ms,sequence,epoch LIMIT ?10').bind(scan.deviceId,scan.fromMs,scan.toMs,scan.highWater,scan.capturedAt,scan.capturedAt-90*DAY,c.wall,c.sequence,c.epoch,COMMUTE_PAGE_ROWS).all<{epoch:number;sequence:number;wall_time_ms:number;trusted_packet_json:string}>()).results;
 return rows.map(row=>{const key={wall:row.wall_time_ms,sequence:row.sequence,epoch:row.epoch};if(!cursorValid(key))throw Error('invalid trusted commute identity');
 const p=unpackPacket(row.trusted_packet_json);if(p.epoch!==row.epoch||p.sequence!==row.sequence||p.wallTimeMs!==row.wall_time_ms)throw Error('trusted commute identity mismatch');
 const point:CommutePoint={wallTimeMs:p.wallTimeMs,trustedLatE7:p.trustedLatE7,trustedLonE7:p.trustedLonE7,uncertaintyCm:p.uncertaintyCm,activity:p.activity,activityConfidence:p.activityConfidence,speedCms:p.speedCms,rawAccepted:p.rawAccepted,fallback:p.fallback};
 if(!pointValid(point))throw Error('invalid trusted commute point');return{key,point};});
}
async function finishSegment(scan:Scan){const s=scan.segment;scan.segment=null;if(!s||s.count<3||s.last.wallTimeMs-s.start<180000||s.distance<200)return;
 const ranked=Object.entries(s.modes).sort((a,b)=>b[1].n-a[1].n),mode=ranked[0]?.[0]??'unknown',stats=ranked[0]?.[1],confidence=stats?Math.max(0,Math.min(1,(stats.confidence/stats.n)/100)):0.25;
 scan.candidates.push({id:await commuteId(scan.deviceId+'|'+s.start+'|'+s.last.wallTimeMs),start:s.start,end:s.last.wallTimeMs,distance:Math.round(s.distance),duration:s.last.wallTimeMs-s.start,mode,confidence});
 if(scan.candidates.length>MAX_SUMMARIES)throw Error('commute summary count limit');
}
async function consume(scan:Scan,p:CommutePoint){let s=scan.segment;if(s&&p.wallTimeMs-s.last.wallTimeMs>15*60000){await finishSegment(scan);s=null;}
 if(!s){if(commuteMoving(p))scan.segment={start:p.wallTimeMs,last:p,count:1,distance:0,modes:{},stationarySince:null};return;}
 const dt=p.wallTimeMs-s.last.wallTimeMs;if(dt>0&&dt<=5*60000){const d=commuteDistance(s.last,p),maximum=Math.max(500,dt/1000*100+(s.last.uncertaintyCm+p.uncertaintyCm)/100);if(d<=maximum)s.distance+=d;
 const m=commuteMode(p.activity);if(m!=='unknown'){const value=s.modes[m]??{n:0,confidence:0};value.n++;value.confidence+=Number(p.activityConfidence??50);s.modes[m]=value;}}
 s.count++;s.last=p;if(commuteMoving(p))s.stationarySince=null;else{s.stationarySince??=p.wallTimeMs;if(p.wallTimeMs-s.stationarySince>=8*60000)await finishSegment(scan);}
}
function saveStatement(db:D1Database,scan:Scan,serialized:string,previous:string|null){
 return db.prepare('INSERT INTO provider_cache(provider,cache_key,value_json,expires_at,updated_at) SELECT ?1,?2,?3,?4,?5 '+
 'WHERE EXISTS(SELECT 1 FROM devices WHERE id=?2 AND revoked_at IS NULL) AND (?6 IS NULL OR EXISTS(SELECT 1 FROM provider_cache WHERE provider=?1 AND cache_key=?2 AND value_json=?6)) '+
 'ON CONFLICT(provider,cache_key) DO UPDATE SET value_json=excluded.value_json,expires_at=excluded.expires_at,updated_at=excluded.updated_at WHERE provider_cache.value_json=?6')
 .bind(PROVIDER,scan.deviceId,serialized,Date.now()+3*DAY,Date.now(),previous);
}
export async function refreshPagedCommutes(db:D1Database,deviceId:string,fromMs:number,toMs:number){
 const from=Math.max(0,fromMs),to=Math.min(Date.now()+DAY,toMs);if(!safe(from)||!safe(to)||to<from||to-from>2*DAY)throw Error('invalid commute scan range');
 await active(db,deviceId);
 const saved=await db.prepare('SELECT value_json,expires_at FROM provider_cache WHERE provider=?1 AND cache_key=?2').bind(PROVIDER,deviceId).first<{value_json:string;expires_at:number}>();
 const previous=saved?.value_json??null,old=saved&&saved.expires_at>Date.now()?decode(saved.value_json,deviceId):null;
 const scan=old&&!old.complete&&from<=old.toMs&&to>=old.fromMs?old:await startScan(db,deviceId,from,to,old?.lastPublishedAt??null);
 for(let page=0;page<COMMUTE_PAGES_PER_SLICE&&!scan.complete;page++){
  const rows=await readPage(db,scan);for(const row of rows){if(scan.cursor&&compare(row.key,scan.cursor)<=0)throw Error('commute history cursor did not advance');await consume(scan,row.point);scan.cursor=row.key;scan.seen++;if(scan.seen>MAX_POINTS)throw Error('commute input count limit');}
  if(rows.length<COMMUTE_PAGE_ROWS){await finishSegment(scan);scan.complete=true;}
 }
 if(scan.complete)scan.lastPublishedAt=Date.now();
 validate(scan,deviceId);const serialized=JSON.stringify(scan);if(serialized.length>MAX_STATE_BYTES)throw Error('commute checkpoint byte limit');
 if(!scan.complete){const write=await saveStatement(db,scan,serialized,previous).run();if(Number(write.meta.changes)!==1)throw Error('commute checkpoint ownership changed');return{created:0,complete:false,processedPoints:scan.seen,windowFromMs:scan.fromMs,windowToMs:scan.toMs};}
 const prior=await db.prepare("SELECT id FROM commute_summaries WHERE device_id=?1 AND started_at>=?2 AND ended_at<=?3 AND provenance='trusted_history_v1'").bind(deviceId,scan.fromMs,scan.toMs).all<{id:string}>();
 const held="EXISTS(SELECT 1 FROM provider_cache WHERE provider=?1 AND cache_key=?2 AND value_json=?3) AND EXISTS(SELECT 1 FROM devices WHERE id=?2 AND revoked_at IS NULL)";
 const candidates=JSON.stringify(scan.candidates);
 const result=await db.batch([saveStatement(db,scan,serialized,previous),
  db.prepare("INSERT INTO provider_cache(provider,cache_key,value_json,expires_at,updated_at) SELECT 'brick_commute_guard_v1',?1,NULL,0,0 WHERE changes()<>1").bind(deviceId),
  db.prepare("DELETE FROM commute_summaries WHERE device_id=?2 AND started_at>=?4 AND ended_at<=?5 AND provenance='trusted_history_v1' AND "+held).bind(PROVIDER,deviceId,serialized,scan.fromMs,scan.toMs),
  db.prepare("INSERT INTO commute_summaries(id,device_id,started_at,ended_at,distance_m,duration_ms,transport_mode,mode_confidence,start_label,end_label,provenance,created_at) "+
  "SELECT json_extract(value,'$.id'),?2,json_extract(value,'$.start'),json_extract(value,'$.end'),json_extract(value,'$.distance'),json_extract(value,'$.duration'),json_extract(value,'$.mode'),json_extract(value,'$.confidence'),NULL,NULL,'trusted_history_v1',?5 FROM json_each(?4) WHERE "+held)
  .bind(PROVIDER,deviceId,serialized,candidates,Date.now())]);
 if(Number(result[0]?.meta.changes)!==1)throw Error('commute checkpoint ownership changed');
 const existing=new Set(prior.results.map(v=>v.id));return{created:scan.candidates.filter(v=>!existing.has(v.id)).length,complete:true,processedPoints:scan.seen,windowFromMs:scan.fromMs,windowToMs:scan.toMs};
}
export async function commuteProgress(db:D1Database,deviceId:string){const row=await db.prepare('SELECT value_json,updated_at FROM provider_cache WHERE provider=?1 AND cache_key=?2 AND expires_at>?3').bind(PROVIDER,deviceId,Date.now()).first<{value_json:string;updated_at:number}>();if(!row)return{state:'NOT_RUN' as const};
 const scan=decode(row.value_json,deviceId);return{state:scan.complete?'COMPLETED' as const:'PENDING' as const,processedPoints:scan.seen,windowFromMs:scan.fromMs,windowToMs:scan.toMs,lastPublishedAt:scan.lastPublishedAt,updatedAt:row.updated_at};}
