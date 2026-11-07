import { history, type Phase4Env } from "./phase4";
import {commuteDistance as distanceM,commuteMode as mode,commuteMoving as moving,commuteId as deterministicId,type CommutePoint as Point} from "./commute-geometry";
import {refreshPagedCommutes,commuteProgress} from "./commute-paging";

export type CommuteEnv = Phase4Env & {BETA_STORAGE_MODE?:string};

function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
export async function refreshCommutes(env:CommuteEnv,deviceId:string,fromMs:number,toMs:number){
  if(env.BETA_STORAGE_MODE==='d1')return refreshPagedCommutes(env.DB,deviceId,fromMs,toMs);
  const response=await history(env,deviceId,fromMs,toMs); if(!response.ok)throw Error('commute history unavailable');
  const body=await response.json<{points?:Point[]}>(); const points=(body.points??[]).filter(p=>Number.isSafeInteger(p.wallTimeMs)).sort((a,b)=>a.wallTimeMs-b.wallTimeMs);
  const segments:Point[][]=[]; let current:Point[]=[]; let stationarySince:number|null=null;
  for(const p of points){
    const prev=current[current.length-1];
    const gap=prev? p.wallTimeMs-prev.wallTimeMs:0;
    if(current.length&&gap>15*60_000){segments.push(current);current=[];stationarySince=null}
    if(moving(p)){
      if(!current.length)current=[p];else current.push(p);
      stationarySince=null;
    }else if(current.length){
      current.push(p);stationarySince??=p.wallTimeMs;
      if(p.wallTimeMs-stationarySince>=8*60_000){segments.push(current);current=[];stationarySince=null}
    }
  }
  if(current.length)segments.push(current);
  let created=0;
  for(const s of segments){
    if(s.length<3)continue;
    const start=s[0].wallTimeMs,end=s[s.length-1].wallTimeMs,duration=end-start;if(duration<3*60_000)continue;
    let distance=0;const modes=new Map<string,{n:number;confidence:number}>();
    for(let i=1;i<s.length;i++){
      const dt=s[i].wallTimeMs-s[i-1].wallTimeMs;if(dt<=0||dt>5*60_000)continue;
      const d=distanceM(s[i-1],s[i]);const max=Math.max(500,dt/1000*100+(s[i-1].uncertaintyCm+s[i].uncertaintyCm)/100);if(d<=max)distance+=d;
      const m=mode(s[i].activity);if(m!=="unknown"){const old=modes.get(m)??{n:0,confidence:0};old.n++;old.confidence+=Number(s[i].activityConfidence??50);modes.set(m,old)}
    }
    if(distance<200)continue;
    const ranked=[...modes.entries()].sort((a,b)=>b[1].n-a[1].n);const transport=ranked[0]?.[0]??"unknown";const stats=ranked[0]?.[1];const confidence=stats?Math.max(0,Math.min(1,(stats.confidence/stats.n)/100)):0.25;
    const id=await deterministicId(`${deviceId}|${start}|${end}`);
    const r=await env.DB.prepare(`INSERT OR IGNORE INTO commute_summaries(id,device_id,started_at,ended_at,distance_m,duration_ms,transport_mode,mode_confidence,start_label,end_label,provenance,created_at)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,NULL,NULL,'trusted_history_v1',?9)`).bind(id,deviceId,start,end,Math.round(distance),duration,transport,confidence,Date.now()).run();
    created+=(r.meta.changes??0);
  }
  return {created};
}

export async function parentCommutes(env:CommuteEnv,deviceId:string,limit=50){
  if(!Number.isFinite(limit)||!Number.isInteger(limit)||limit<1)return json({error:"invalid commute limit"},400);
  const n=Math.min(100,limit);
  const r=await env.DB.prepare("SELECT id,started_at,ended_at,distance_m,duration_ms,transport_mode,mode_confidence,start_label,end_label,provenance FROM commute_summaries WHERE device_id=?1 ORDER BY started_at DESC LIMIT ?2").bind(deviceId,n).all();
  let progress:unknown;try{progress=await commuteProgress(env.DB,deviceId);}catch{progress={state:'UNAVAILABLE'};}
  return json({commutes:r.results,progress});
}
