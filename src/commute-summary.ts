import { history, type Phase4Env } from "./phase4";

type Point = {
  wallTimeMs: number;
  trustedLatE7: number | null;
  trustedLonE7: number | null;
  uncertaintyCm: number;
  activity: number;
  activityConfidence?: number;
  speedCms: number | null;
  rawAccepted: boolean;
  fallback: boolean;
};
export type CommuteEnv = Phase4Env;

function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
function rad(v:number){return v*Math.PI/180}
function distanceM(a:Point,b:Point){
  if(a.trustedLatE7==null||a.trustedLonE7==null||b.trustedLatE7==null||b.trustedLonE7==null)return 0;
  const aLat=a.trustedLatE7/1e7,aLon=a.trustedLonE7/1e7,bLat=b.trustedLatE7/1e7,bLon=b.trustedLonE7/1e7,R=6371000;
  const dLat=rad(bLat-aLat),dLon=rad(bLon-aLon),x=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function mode(activity:number){return activity===2?"walking":activity===3?"running":activity===4?"bicycle":activity===5?"vehicle":"unknown"}
function moving(p:Point){return p.activity!==1 && (p.speedCms==null || p.speedCms>=80)}

export async function refreshCommutes(env:CommuteEnv,deviceId:string,fromMs:number,toMs:number){
  const response=await history(env,deviceId,fromMs,toMs); if(!response.ok)return {created:0};
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

async function deterministicId(text:string){const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)));return "comm_"+Array.from(digest.slice(0,16),b=>b.toString(16).padStart(2,"0")).join("")}

export async function parentCommutes(env:CommuteEnv,deviceId:string,limit=50){
  const n=Math.max(1,Math.min(100,Math.trunc(limit)));
  const r=await env.DB.prepare("SELECT id,started_at,ended_at,distance_m,duration_ms,transport_mode,mode_confidence,start_label,end_label,provenance FROM commute_summaries WHERE device_id=?1 ORDER BY started_at DESC LIMIT ?2").bind(deviceId,n).all();
  return json({commutes:r.results});
}
