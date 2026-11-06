import base from './worker-p8b';
import { parentAuthorized,unauthorizedParent } from './access-auth';
import { betaDevice,betaParent,betaJson,cleanupBeta,consumeBetaProbe,type BetaEnv } from './beta-api';
import { parentBetaHtml } from './parent-beta';
import { BETA_RELEASE,BETA_APK_KEY } from './beta-release';
export { BrickDevice } from './beta-device';
type Env=Parameters<typeof base.fetch>[1]&BetaEnv;
export default {
 async fetch(req:Request<unknown,IncomingRequestCfProperties>,env:Env,ctx:ExecutionContext):Promise<Response>{
  const u=new URL(req.url);
  const device=u.pathname.match(/^\/api\/device\/([A-Za-z0-9_-]{1,128})\/beta\/(readiness|observations)$/);
  if(device)return betaDevice(req,env,device[1],device[2]);
  const parent=u.pathname.match(/^\/parent\/api\/device\/([A-Za-z0-9_-]{1,128})\/beta\/(status|ack|import)$/);
  const download=u.pathname.match(/^\/parent\/beta\/download\/(apk|manifest|checksum)$/);
  if(parent||download){
   if(!await parentAuthorized(req,env))return unauthorizedParent(req);
   if(req.method!=='GET'&&req.headers.get('Origin')!==u.origin)return betaJson({error:'same_origin_required'},403);
   if(env.APP_ENV!=='development'||env.BETA_STORAGE_MODE!=='d1'||env.BETA_CHANNEL!=='beta')return betaJson({error:'beta_unavailable'},503);
   try{
    if(!env.BETA_PARENT_RATE||!(await env.BETA_PARENT_RATE.limit({key:'beta-parent:'+(req.headers.get('CF-Connecting-IP')??'unknown')})).success)return betaJson({error:'parent_rate_limited'},429);
    if(parent)return await betaParent(req,env,parent[1],parent[2]);
    if(req.method!=='GET')return betaJson({error:'method_not_allowed'},405);
    if(download![1]==='manifest')return betaJson({...BETA_RELEASE,backendSourceSha:env.BETA_SOURCE_SHA,phase2:'BETA',storageMode:'d1-chunked',eventMode:'direct-d1',physicalQualification:'REQUIRED',endurance:'REVIEW_REQUIRED'});
    if(download![1]==='checksum')return new Response(BETA_RELEASE.apkSha256+'  Brick.apk\n',{headers:{'Content-Type':'text/plain','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    if(!BETA_RELEASE.available)return betaJson({error:'new_apk_safety_revision_pending_validation'},503);
    const apk=await env.HISTORY.get(BETA_APK_KEY);if(!apk||apk.size>10*1024*1024)return betaJson({error:'verified_apk_unavailable'},503);
    const bytes=await apk.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==BETA_RELEASE.apkSha256)return betaJson({error:'verified_apk_unavailable'},503);
    return new Response(bytes,{headers:{'Content-Type':'application/vnd.android.package-archive','Content-Disposition':'attachment; filename="Brick-Beta-1.0.0-beta.2.apk"','Content-Length':String(apk.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
   }catch{return betaJson({error:'beta_service_unavailable'},503);}
  }
  const response=await base.fetch(req,env,ctx);
  if(req.method==='GET'&&/^\/parent\/?$/.test(u.pathname)&&response.ok&&response.headers.get('Content-Type')?.includes('text/html'))return new Response(parentBetaHtml(await response.text()),{status:response.status,headers:response.headers});
  return response;
 },
 async queue(batch:MessageBatch<unknown>,env:Env,ctx:ExecutionContext){
  const rest:Message<unknown>[]=[];for(const message of batch.messages)if(!await consumeBetaProbe(message,env))rest.push(message);
  if(rest.length)await base.queue({...batch,messages:rest},env,ctx);
 },
 async scheduled(controller:ScheduledController,env:Env,ctx:ExecutionContext){await base.scheduled(controller,env,ctx);ctx.waitUntil(cleanupBeta(env));}
} satisfies ExportedHandler<Env>;
