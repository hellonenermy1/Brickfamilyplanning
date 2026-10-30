import type { LivePacket } from "./protocol";

export type Phase4Env = { DB: D1Database; HISTORY: R2Bucket };

type Geofence = { id:string; name:string; latitude:number; longitude:number; radius_m:number };
type GeoState = { stable_state:string; candidate_state:string|null; candidate_since:number|null; candidate_count:number };
type Trip = { id:string; destination_name:string|null; destination_latitude:number|null; destination_longitude:number|null; destination_radius_m:number; expected_arrival_at:number|null; arrival_candidate_since:number|null; arrival_candidate_count:number; last_alert_at:number|null };

function radians(v:number){ return v*Math.PI/180; }
function distanceM(aLat:number,aLon:number,bLat:number,bLon:number){
  const R=6371000; const dLat=radians(bLat-aLat); const dLon=radians(bLon-aLon);
  const x=Math.sin(dLat/2)**2+Math.cos(radians(aLat))*Math.cos(radians(bLat))*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
async function internalEvent(env:Phase4Env,deviceId:string,kind:string,lat:number|null,lon:number|null,accuracyM:number|null,detail:Record<string,unknown>){
  const now=Date.now();
  await env.DB.prepare("INSERT INTO safety_events(id,device_id,kind,device_created_at,server_created_at,latitude,longitude,accuracy_m,detail_json) VALUES(?1,?2,?3,?4,?4,?5,?6,?7,?8)")
    .bind(crypto.randomUUID(),deviceId,kind,now,lat,lon,accuracyM,JSON.stringify(detail)).run();
}

export async function evaluateSafety(env:Phase4Env,deviceId:string,packet:LivePacket){
  if(packet.trustedLatE7===null||packet.trustedLonE7===null)return;
  const lat=packet.trustedLatE7/1e7, lon=packet.trustedLonE7/1e7, accuracyM=packet.uncertaintyCm/100;
  if(!Number.isFinite(accuracyM)||accuracyM>250)return;
  const now=Date.now();
  const fences=await env.DB.prepare("SELECT id,name,latitude,longitude,radius_m FROM geofences WHERE device_id=?1 AND enabled=1").bind(deviceId).all<Geofence>();
  for(const g of fences.results){
    const d=distanceM(lat,lon,g.latitude,g.longitude);
    const current=await env.DB.prepare("SELECT stable_state,candidate_state,candidate_since,candidate_count FROM geofence_state WHERE geofence_id=?1").bind(g.id).first<GeoState>();
    const stable=current?.stable_state??"unknown";
    const enterThreshold=Math.max(25,g.radius_m-Math.min(30,g.radius_m*0.15));
    const exitThreshold=g.radius_m+Math.max(25,g.radius_m*0.20);
    const desired=stable==="inside" ? (d>=exitThreshold?"outside":"inside") : (d<=enterThreshold?"inside":"outside");
    if(stable==="unknown"){
      await env.DB.prepare("INSERT OR REPLACE INTO geofence_state(geofence_id,device_id,stable_state,candidate_state,candidate_since,candidate_count,last_distance_m,updated_at) VALUES(?1,?2,?3,NULL,NULL,0,?4,?5)")
        .bind(g.id,deviceId,desired,d,now).run();
      continue;
    }
    if(desired===stable){
      await env.DB.prepare("UPDATE geofence_state SET candidate_state=NULL,candidate_since=NULL,candidate_count=0,last_distance_m=?1,updated_at=?2 WHERE geofence_id=?3").bind(d,now,g.id).run();
      continue;
    }
    const same=current?.candidate_state===desired;
    const since=same&&current?.candidate_since?current.candidate_since:now;
    const count=same?(current?.candidate_count??0)+1:1;
    if(count>=2 && now-since>=10_000){
      await env.DB.prepare("UPDATE geofence_state SET stable_state=?1,candidate_state=NULL,candidate_since=NULL,candidate_count=0,last_distance_m=?2,updated_at=?3 WHERE geofence_id=?4").bind(desired,d,now,g.id).run();
      await internalEvent(env,deviceId,desired==="inside"?"geofence_enter":"geofence_exit",lat,lon,accuracyM,{geofenceId:g.id,name:g.name,distanceM:Math.round(d)});
    }else{
      await env.DB.prepare("UPDATE geofence_state SET candidate_state=?1,candidate_since=?2,candidate_count=?3,last_distance_m=?4,updated_at=?5 WHERE geofence_id=?6").bind(desired,since,count,d,now,g.id).run();
    }
  }

  const trip=await env.DB.prepare("SELECT id,destination_name,destination_latitude,destination_longitude,destination_radius_m,expected_arrival_at,arrival_candidate_since,arrival_candidate_count,last_alert_at FROM trips WHERE device_id=?1 AND state='active' ORDER BY started_at DESC LIMIT 1").bind(deviceId).first<Trip>();
  if(!trip)return;
  if(trip.destination_latitude!==null&&trip.destination_longitude!==null){
    const d=distanceM(lat,lon,trip.destination_latitude,trip.destination_longitude);
    if(d<=trip.destination_radius_m){
      const since=trip.arrival_candidate_since??now; const count=(trip.arrival_candidate_count??0)+1;
      if(count>=2 && now-since>=10_000){
        await env.DB.prepare("UPDATE trips SET state='arrived',ended_at=?1,arrival_candidate_since=NULL,arrival_candidate_count=0 WHERE id=?2").bind(now,trip.id).run();
        await internalEvent(env,deviceId,"trip_ended",lat,lon,accuracyM,{tripId:trip.id,reason:"arrived",destination:trip.destination_name});
      }else await env.DB.prepare("UPDATE trips SET arrival_candidate_since=?1,arrival_candidate_count=?2 WHERE id=?3").bind(since,count,trip.id).run();
    }else if(trip.arrival_candidate_count>0){
      await env.DB.prepare("UPDATE trips SET arrival_candidate_since=NULL,arrival_candidate_count=0 WHERE id=?1").bind(trip.id).run();
    }
  }
  if(trip.expected_arrival_at && now>trip.expected_arrival_at+10*60_000 && (!trip.last_alert_at||now-trip.last_alert_at>30*60_000)){
    await env.DB.prepare("UPDATE trips SET last_alert_at=?1 WHERE id=?2").bind(now,trip.id).run();
    await internalEvent(env,deviceId,"trip_alert",lat,lon,accuracyM,{tripId:trip.id,reason:"overdue",destination:trip.destination_name});
  }
}

export async function createGeofence(req:Request,env:Phase4Env,deviceId:string){
  const b=await req.json<Record<string,unknown>>().catch(()=>({}));
  const name=typeof b.name==="string"?b.name.trim().slice(0,64):""; const lat=Number(b.latitude),lon=Number(b.longitude),radius=Number(b.radiusM);
  if(!name||!Number.isFinite(lat)||lat< -90||lat>90||!Number.isFinite(lon)||lon< -180||lon>180||!Number.isFinite(radius)||radius<25||radius>5000)return Response.json({error:"invalid geofence"},{status:400});
  const id=crypto.randomUUID(); await env.DB.prepare("INSERT INTO geofences(id,device_id,name,latitude,longitude,radius_m,enabled,created_at) VALUES(?1,?2,?3,?4,?5,?6,1,?7)").bind(id,deviceId,name,lat,lon,radius,Date.now()).run();
  return Response.json({id,name,latitude:lat,longitude:lon,radiusM:radius});
}
export async function listGeofences(env:Phase4Env,deviceId:string){ const r=await env.DB.prepare("SELECT id,name,latitude,longitude,radius_m,enabled,created_at FROM geofences WHERE device_id=?1 ORDER BY created_at").bind(deviceId).all(); return Response.json({geofences:r.results}); }

export async function startTrip(req:Request,env:Phase4Env,deviceId:string){
  const b=await req.json<Record<string,unknown>>().catch(()=>({})); const name=typeof b.destinationName==="string"?b.destinationName.trim().slice(0,80):null;
  const lat=b.latitude==null?null:Number(b.latitude),lon=b.longitude==null?null:Number(b.longitude),expected=b.expectedArrivalAt==null?null:Number(b.expectedArrivalAt),radius=b.radiusM==null?120:Number(b.radiusM);
  if((lat===null)!==(lon===null)|| (lat!==null&&(!Number.isFinite(lat)||!Number.isFinite(lon!)||lat< -90||lat>90||lon!< -180||lon!>180)) || !Number.isFinite(radius)||radius<50||radius>1000)return Response.json({error:"invalid trip"},{status:400});
  await env.DB.prepare("UPDATE trips SET state='cancelled',ended_at=?1 WHERE device_id=?2 AND state='active'").bind(Date.now(),deviceId).run();
  const id=crypto.randomUUID(),now=Date.now(); await env.DB.prepare("INSERT INTO trips(id,device_id,state,destination_name,destination_latitude,destination_longitude,destination_radius_m,expected_arrival_at,started_at) VALUES(?1,?2,'active',?3,?4,?5,?6,?7,?8)").bind(id,deviceId,name,lat,lon,radius,expected,now).run();
  await internalEvent(env,deviceId,"trip_started",lat,lon,null,{tripId:id,destination:name}); return Response.json({id,state:"active"});
}
export async function listTrips(env:Phase4Env,deviceId:string){ const r=await env.DB.prepare("SELECT id,state,destination_name,destination_latitude,destination_longitude,destination_radius_m,expected_arrival_at,started_at,ended_at,last_alert_at FROM trips WHERE device_id=?1 ORDER BY started_at DESC LIMIT 100").bind(deviceId).all(); return Response.json({trips:r.results}); }

export async function history(env:Phase4Env,deviceId:string,fromMs:number,toMs:number){
  const start=Math.max(0,fromMs),end=Math.min(Date.now()+86_400_000,toMs); if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>31*86_400_000)return Response.json({error:"invalid history range"},{status:400});
  const safe=deviceId.replace(/[^a-zA-Z0-9_-]/g,"_"); const days:string[]=[]; for(let t=new Date(start).setUTCHours(0,0,0,0);t<=end;t+=86_400_000)days.push(new Date(t).toISOString().slice(0,10));
  const points:Record<string,unknown>[]=[];
  for(const day of days){ let cursor:string|undefined; do{ const list=await env.HISTORY.list({prefix:`history/${safe}/${day}/`,cursor,limit:1000}); for(const o of list.objects){ const obj=await env.HISTORY.get(o.key); if(!obj)continue; const row=await obj.json<Record<string,unknown>>(); const p=row.packet as Record<string,unknown>|undefined; const t=typeof p?.wallTimeMs==="number"?p.wallTimeMs:0; if(p&&t>=start&&t<=end)points.push(p); if(points.length>=10000)break;} cursor=list.truncated?list.cursor:undefined;}while(cursor&&points.length<10000); if(points.length>=10000)break; }
  points.sort((a,b)=>Number(a.wallTimeMs??0)-Number(b.wallTimeMs??0)); return Response.json({points,truncated:points.length>=10000});
}
