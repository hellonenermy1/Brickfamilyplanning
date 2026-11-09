import {runCaptureWriter,runCaptureWriterRpc} from './capture-writer-boundary';
import {captureUrgentRequestAllowed} from './capture-urgent-request';
import beta from './worker-beta';
import {stagedCaptureDatabases} from './capture-d1-boundary';
import {watchdogDeadline} from './watchdog-work';
import { developmentRuntimeEnv,cleanupDevelopmentObjectStore } from './dev-free-runtime';
import { authorizeDevParentRequest,cleanupDevParentAuth,devParentSessionValid,devParentUnauthorized,handleDevParentAuthRoute,stripDevParentInternalHeader } from './dev-parent-auth';
import { syntheticScheduledController } from './dev-maintenance';
import { runMaintenanceTask,awaitScheduledWork } from './maintenance-task';
import { activeDevice,betaJson } from './beta-api';
import { BETA_APK_KEY,BETA_RELEASE } from './beta-release';
export { BetaScheduler } from './beta-scheduler';
import { readBoundedBody } from './bounded-body';
export { BrickDevice } from './beta-device';
export type CardfreeEnv=Parameters<typeof beta.fetch>[1]&{PARENT_LOGIN_RATE:RateLimit;DEV_PARENT_LOGIN_HASH:string;DEV_PARENT_AUTH_MODE:string;BRICK_MAP_SOURCE:string;BETA_STORAGE_MODE:string;WATCHDOG_MANAGED_BY_ROOT?:boolean;BETA_SCHEDULER:DurableObjectNamespace<import('./beta-scheduler').BetaScheduler>};
type Env=CardfreeEnv;
export function cardfreeRuntime(env:Env,ctx?:ExecutionContext):Env{
 const result=developmentRuntimeEnv(env);const direct=result.EVENTS;
 return {...result,WATCHDOG_MANAGED_BY_ROOT:true,BACKGROUND_WORK:{
  run(kind,deviceId){return runCaptureWriterRpc('scheduler.derived',ctx,parent=>env.BETA_SCHEDULER.get(env.BETA_SCHEDULER.idFromName('derived-'+deviceId)).runDerivedWork(kind,deviceId,parent));},
  cleanup(){return runCaptureWriterRpc('scheduler.retention',ctx,parent=>env.BETA_SCHEDULER.get(env.BETA_SCHEDULER.idFromName('maintenance-refined-retention')).runRetentionWork(parent));},
  backup(){return runCaptureWriterRpc('scheduler.backup',ctx,parent=>env.BETA_SCHEDULER.get(env.BETA_SCHEDULER.idFromName('maintenance-backup')).runDailyBackup(parent));}
 },EVENTS:{
  async send(body:unknown){
   const b=body as {type?:string;deviceId?:string;token?:string};
   if(b?.type==='brick_beta_probe_v1'){
    if(typeof b.deviceId!=='string'||typeof b.token!=='string'||!await activeDevice(env,b.deviceId))throw Error('invalid_beta_event');
    await env.BETA_DB.prepare('UPDATE beta_challenges SET queue_at=?1 WHERE device_id=?2 AND token=?3 AND expires_at>=?1').bind(Date.now(),b.deviceId,b.token).run();
   }else await direct.send(body);
  },async sendBatch(entries:{body:unknown}[]){await direct.sendBatch(entries);}
 } as unknown as Queue};
}
// OneMap raster tiles are fetched server-side and returned on this authenticated, same-origin
// URL. Never widen the parent's CSP to allow arbitrary external requests or leak child map
// viewport requests from the browser directly to a tile provider.
async function serveBetaOneMapTile(url:URL):Promise<Response|null>{
 const logo=url.pathname==='/parent/map/onemap/logo.png';
 const match=url.pathname.match(/^\/parent\/map\/onemap\/(Default_HD|Default|Grey|Grey_HD)\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.png$/);
 if(!match&&!logo)return null;
 const z=match?Number(match[2]):0,x=match?Number(match[3]):0,y=match?Number(match[4]):0;
 if(match&&(z<11||z>19||x>=2**z||y>=2**z))return betaJson({error:'invalid_map_tile'},404);
 const upstream=logo?'https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png':'https://www.onemap.gov.sg/maps/tiles/'+match![1]+'/'+z+'/'+x+'/'+y+'.png';
 try{
  const response=await fetch(upstream,{headers:{Accept:'image/png'},redirect:'follow',signal:AbortSignal.timeout(12000),cf:{cacheEverything:true,cacheTtl:86400}});
  if(!response.ok)return betaJson({error:'map_provider_unavailable',upstreamStatus:response.status},502);
  const length=Number(response.headers.get('Content-Length')||0);
  if(length>1500000)return betaJson({error:'map_tile_oversized'},502);
  const raw=await response.arrayBuffer(),bytes=new Uint8Array(raw);
  if(bytes.byteLength<8||bytes.byteLength>1500000||![137,80,78,71,13,10,26,10].every((value,i)=>bytes[i]===value))return betaJson({error:'map_provider_invalid_png'},502);
  return new Response(raw,{headers:{'Content-Type':'image/png','Content-Length':String(bytes.byteLength),'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
 }catch{return betaJson({error:'map_provider_unavailable'},502);}
}
async function closeSockets(env:Env){let after='';for(let page=0;page<100;page++){const rows=await env.DB.prepare('SELECT id FROM devices WHERE id>?1 ORDER BY id LIMIT 100').bind(after).all<{id:string}>();for(const r of rows.results)await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(r.id)).closeParentSockets();if(rows.results.length<100)return;after=rows.results[rows.results.length-1].id;}throw Error('socket_invalidation_limit');}
export async function runCardfreeMaintenanceGroup(env:Env,ctx:ExecutionContext,group:'minute'|'daily'){
 const r=cardfreeRuntime(env,ctx),now=Date.now();
 if(group==='minute')return(await runMaintenanceTask(env.DB,'beta-minute-v2',60000,()=>awaitScheduledWork(scoped=>beta.scheduled(syntheticScheduledController('*/1 * * * *',now),r,scoped),ctx)))==='BUSY'?'PENDING' as const:'COMPLETED' as const;
 if(group!=='daily')throw Error('invalid maintenance group');
 const daily=await runMaintenanceTask(env.DB,'beta-daily-v2',86400000,()=>awaitScheduledWork(async scoped=>{
  await beta.scheduled(syntheticScheduledController('17 3 * * *',now),r,scoped);
  scoped.waitUntil(cleanupDevelopmentObjectStore(env.DB,now));scoped.waitUntil(cleanupDevParentAuth({DB:env.DB},now));
 },ctx));return daily==='BUSY'?'PENDING' as const:'COMPLETED' as const;
}
export async function runCardfreeMaintenance(env:Env,_ctx:ExecutionContext,onWatchdogDelay?:(ms:number)=>void){
 let busy=false;
 // Independent backup/cleanup must start even if a watchdog receiver stalls.
 const tasks=[(async()=>{const watchdog=await watchdogDeadline(()=>env.BETA_SCHEDULER.get(env.BETA_SCHEDULER.idFromName('maintenance-watchdog')).runWatchdogPage(),12000);busy=busy||!watchdog.complete;onWatchdogDelay?.(watchdog.nextDelayMs);if(watchdog.failed)throw Error('watchdog incomplete');})(),...(['minute','daily'] as const).map(async group=>{const result=await env.BETA_SCHEDULER.get(env.BETA_SCHEDULER.idFromName('maintenance-'+group)).runGroup(group);busy=busy||result==='PENDING';})];
 if((await Promise.allSettled(tasks)).some(r=>r.status==='rejected'))throw Error('cardfree maintenance failed');
 return busy?'PENDING' as const:'COMPLETED' as const;
}
function maintenance(env:Env,ctx:ExecutionContext){ctx.waitUntil(env.BETA_SCHEDULER.get(env.BETA_SCHEDULER.idFromName('beta-maintenance')).kick().catch(()=>{}));}
export default {
 async fetch(req:Request<unknown,IncomingRequestCfProperties>,env:Env,ctx:ExecutionContext):Promise<Response>{
  return runCaptureWriter(env,'worker.fetch',async()=>await captureUrgentRequestAllowed(req,env)?'urgent':'ordinary',ctx,async ctx=>{
  env=stagedCaptureDatabases(env,ctx);
  if(env.APP_ENV!=='development'||env.DEV_PARENT_AUTH_MODE!=='d1-session-v1'||env.BETA_STORAGE_MODE!=='d1'||env.BETA_CHANNEL!=='beta')return betaJson({error:'cardfree_configuration_required'},503);
  const clean=stripDevParentInternalHeader(req),u=new URL(clean.url),r=cardfreeRuntime(env,ctx);maintenance(env,ctx);
  if(u.pathname==='/parent'||u.pathname.startsWith('/parent/')){
   const auth={DB:env.DB,PARENT_LOGIN_RATE:env.PARENT_LOGIN_RATE,DEV_PARENT_LOGIN_HASH:env.DEV_PARENT_LOGIN_HASH};
   const invalidateParentSockets=clean.method==='POST'&&(u.pathname==='/parent/logout'||u.pathname==='/parent/change-password')&&await devParentSessionValid(clean,auth);
   const authResponse=await handleDevParentAuthRoute(clean,auth);
   if(authResponse){if(invalidateParentSockets&&authResponse.status===303){try{await closeSockets(env);}catch{return betaJson({error:'session_revoked_streams_expire_within_30s'},503);}}return authResponse;}
   const authorized=await authorizeDevParentRequest(clean,auth);if(!authorized)return devParentUnauthorized(clean);
   if(u.pathname.startsWith('/parent/map/onemap/')){
    if(clean.method!=='GET')return betaJson({error:'method_not_allowed'},405);
    return await serveBetaOneMapTile(u)??betaJson({error:'invalid_map_tile'},404);
   }
   if(u.pathname==='/parent/beta/publish/apk'){
    if(clean.method!=='POST'||clean.headers.get('Origin')!==u.origin)return betaJson({error:'same_origin_post_required'},403);
    const body=await readBoundedBody(authorized,10*1024*1024);if(!body.ok)return betaJson({error:'apk_too_large'},400);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body.body))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if(!BETA_RELEASE.available||hash!==BETA_RELEASE.apkSha256)return betaJson({error:'approved_apk_required'},409);
    await r.HISTORY.put(BETA_APK_KEY,body.body);const stored=await r.HISTORY.get(BETA_APK_KEY);if(!stored||stored.size!==body.body.byteLength)return betaJson({error:'apk_storage_failed'},503);
    return betaJson({published:true,sha256:hash,storageMode:'d1-chunked'});
   }
   const response=await beta.fetch(authorized as Request<unknown,IncomingRequestCfProperties>,r,ctx);
   const headers=new Headers(response.headers);headers.set('X-Brick-Storage','d1-chunked-no-r2');headers.set('X-Brick-Parent-Auth','d1-session-v1');return new Response(response.body,{status:response.status,statusText:response.statusText,headers,...(response.webSocket?{webSocket:response.webSocket}:{})});
  }
  return beta.fetch(clean as Request<unknown,IncomingRequestCfProperties>,r,ctx);
  },()=>captureUrgentRequestAllowed(req,env));
 },
 async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext){return runCaptureWriter(env,'worker.scheduled','urgent',ctx,async ctx=>{await runCardfreeMaintenance(stagedCaptureDatabases(env,ctx),ctx);},async()=>true);}
} satisfies ExportedHandler<Env>;
