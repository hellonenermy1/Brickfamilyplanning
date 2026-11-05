import beta from './worker-beta';
import { developmentRuntimeEnv,cleanupDevelopmentObjectStore } from './dev-free-runtime';
import { authorizeDevParentRequest,cleanupDevParentAuth,devParentSessionValid,devParentUnauthorized,handleDevParentAuthRoute,stripDevParentInternalHeader } from './dev-parent-auth';
import { claimDevMaintenance,syntheticScheduledController } from './dev-maintenance';
import { activeDevice,betaJson } from './beta-api';
import { BETA_APK_KEY,BETA_RELEASE } from './beta-release';
export { BetaScheduler } from './beta-scheduler';
import { readBoundedBody } from './bounded-body';
export { BrickDevice } from './beta-device';
export type CardfreeEnv=Parameters<typeof beta.fetch>[1]&{PARENT_LOGIN_RATE:RateLimit;DEV_PARENT_LOGIN_HASH:string;DEV_PARENT_AUTH_MODE:string;BRICK_MAP_SOURCE:string;BETA_STORAGE_MODE:string;BETA_SCHEDULER:DurableObjectNamespace<import('./beta-scheduler').BetaScheduler>};
type Env=CardfreeEnv;
export function cardfreeRuntime(env:Env):Env{
 const result=developmentRuntimeEnv(env);const direct=result.EVENTS;
 return {...result,EVENTS:{
  async send(body:unknown){
   const b=body as {type?:string;deviceId?:string;token?:string};
   if(b?.type==='brick_beta_probe_v1'){
    if(typeof b.deviceId!=='string'||typeof b.token!=='string'||!await activeDevice(env,b.deviceId))throw Error('invalid_beta_event');
    await env.BETA_DB.prepare('UPDATE beta_challenges SET queue_at=?1 WHERE device_id=?2 AND token=?3 AND expires_at>=?1').bind(Date.now(),b.deviceId,b.token).run();
   }else await direct.send(body);
  },async sendBatch(entries:{body:unknown}[]){await direct.sendBatch(entries);}
 } as unknown as Queue};
}
async function closeSockets(env:Env){let after='';for(let page=0;page<100;page++){const rows=await env.DB.prepare('SELECT id FROM devices WHERE id>?1 ORDER BY id LIMIT 100').bind(after).all<{id:string}>();for(const r of rows.results)await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(r.id)).closeParentSockets();if(rows.results.length<100)return;after=rows.results[rows.results.length-1].id;}throw Error('socket_invalidation_limit');}
export async function runCardfreeMaintenance(env:Env,ctx:ExecutionContext){const r=cardfreeRuntime(env),now=Date.now();if(await claimDevMaintenance(env.DB,'beta-minute',60000,now))await beta.scheduled(syntheticScheduledController('*/1 * * * *',now),r,ctx);if(await claimDevMaintenance(env.DB,'beta-daily',86400000,now)){await beta.scheduled(syntheticScheduledController('17 3 * * *',now),r,ctx);await cleanupDevelopmentObjectStore(env.DB);await cleanupDevParentAuth({DB:env.DB});}}
function maintenance(env:Env,ctx:ExecutionContext){ctx.waitUntil(env.BETA_SCHEDULER.get(env.BETA_SCHEDULER.idFromName('beta-maintenance')).arm().catch(()=>{}));ctx.waitUntil(runCardfreeMaintenance(env,ctx).catch(()=>{}));}
export default {
 async fetch(req:Request<unknown,IncomingRequestCfProperties>,env:Env,ctx:ExecutionContext):Promise<Response>{
  if(env.APP_ENV!=='development'||env.DEV_PARENT_AUTH_MODE!=='d1-session-v1'||env.BETA_STORAGE_MODE!=='d1'||env.BETA_CHANNEL!=='beta')return betaJson({error:'cardfree_configuration_required'},503);
  const clean=stripDevParentInternalHeader(req),u=new URL(clean.url),r=cardfreeRuntime(env);maintenance(env,ctx);
  if(u.pathname==='/parent'||u.pathname.startsWith('/parent/')){
   const auth={DB:env.DB,PARENT_LOGIN_RATE:env.PARENT_LOGIN_RATE,DEV_PARENT_LOGIN_HASH:env.DEV_PARENT_LOGIN_HASH};
   const logout=clean.method==='POST'&&u.pathname==='/parent/logout'&&await devParentSessionValid(clean,auth);
   const authResponse=await handleDevParentAuthRoute(clean,auth);
   if(authResponse){if(logout&&authResponse.status===303){try{await closeSockets(env);}catch{return betaJson({error:'session_revoked_streams_expire_within_30s'},503);}}return authResponse;}
   const authorized=await authorizeDevParentRequest(clean,auth);if(!authorized)return devParentUnauthorized(clean);
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
 },
 async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext){await runCardfreeMaintenance(env,ctx);}
} satisfies ExportedHandler<Env>;
