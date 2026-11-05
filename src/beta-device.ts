import { BrickDevice as BaseBrickDevice } from './device-do';

/** Same real per-device object and sockets; one disposable key, no telemetry/recovery markers changed. */
export class BrickDevice extends BaseBrickDevice {
 protected override get recoveryIncludesBetaDiagnostic(): boolean {
  // The beta adds exactly one disposable diagnostic key. Other unknown keys still
  // fail the production recovery allowlist; no probe token is restored or revived.
  return true;
 }
 override async fetch(req: Request): Promise<Response> {
  if(new URL(req.url).pathname !== '/beta/probe') return super.fetch(req);
  const life = await this.ctx.storage.get<boolean>('wsRevoked');
  if(life === true) return new Response('revoked',{status:410});
  const b=await req.json<{deviceId:string;token:string;expiresAt:number}>();
  if(req.method!=='POST'||!/^[A-Za-z0-9_-]{1,128}$/.test(b.deviceId)||!/^[0-9a-f-]{36}$/.test(b.token)||!Number.isSafeInteger(b.expiresAt)||b.expiresAt<=Date.now()||b.expiresAt>Date.now()+301000) return new Response('invalid',{status:400});
  await this.ctx.storage.put('betaDiagnostic',{token:b.token,expiresAt:b.expiresAt});
  const saved=await this.ctx.storage.get<{token:string}>('betaDiagnostic');
  // Real current-state route must still function; never replace it with a disconnected dummy DO.
  const state=await super.fetch(new Request('https://internal/state'));
  if(!state.ok||saved?.token!==b.token||await this.ctx.storage.get<boolean>('wsRevoked')===true)return new Response('unavailable',{status:503});
  let delivered=0;
  for(const ws of this.ctx.getWebSockets()){
   try{const a=ws.deserializeAttachment() as {v?:number;expiresAt?:number};if(a?.v===1&&typeof a.expiresAt==='number'&&a.expiresAt>Date.now()) {ws.send(JSON.stringify({type:'beta_challenge',deviceId:b.deviceId,token:b.token,expiresAt:b.expiresAt}));delivered++;}}catch{}
  }
  return Response.json({token:saved.token,stateReadable:true,delivered});
 }
}
