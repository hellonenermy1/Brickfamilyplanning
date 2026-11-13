import {runCaptureWriter} from './capture-writer-boundary';
import {stagedCaptureDatabases} from './capture-d1-boundary';
import type {LivePacket} from './protocol';
import type {DeviceHealth,NetworkEvidence,RealtimeSafetyEvent,LiveTraceInput} from './device-do';
import { BrickDevice as BaseBrickDevice } from './device-do';

/** Same real per-device object and sockets; one disposable key, no telemetry/recovery markers changed. */
export class BrickDevice extends BaseBrickDevice {
 constructor(ctx:DurableObjectState,env:ConstructorParameters<typeof BaseBrickDevice>[1]){super(ctx,stagedCaptureDatabases(env,ctx));}
 // Only archived-state mutation RPCs are wrapped. Read-only export/state and
 // disposable socket/diagnostic lifecycle stay separate; no live controller is installed.
 override async setLatest(packet:LivePacket){return runCaptureWriter(this,'device.latest','urgent',this.ctx,()=>super.setLatest(packet));}
 override async setLatestWithTrace(packet:LivePacket,trace:LiveTraceInput){return runCaptureWriter(this,'device.latest-trace','urgent',this.ctx,()=>super.setLatestWithTrace(packet,trace));}
 override async setHealth(health:DeviceHealth){return runCaptureWriter(this,'device.health','urgent',this.ctx,()=>super.setHealth(health));}
 override async setNetworkEvidence(network:NetworkEvidence){return runCaptureWriter(this,'device.network','urgent',this.ctx,()=>super.setNetworkEvidence(network));}
 override async pushSafetyEvent(event:RealtimeSafetyEvent){return runCaptureWriter(this,'device.safety','urgent',this.ctx,()=>super.pushSafetyEvent(event));}
 override async commitSequenceHighWater(epoch:number,sequence:number){return runCaptureWriter(this,'device.sequence','urgent',this.ctx,()=>super.commitSequenceHighWater(epoch,sequence));}
 override async commitSafetyEvaluation(epoch:number,sequence:number){return runCaptureWriter(this,'device.safety-evaluation','urgent',this.ctx,()=>super.commitSafetyEvaluation(epoch,sequence));}
 override async commitSafetyHighWater(sequence:number){return runCaptureWriter(this,'device.safety-marker','urgent',this.ctx,()=>super.commitSafetyHighWater(sequence));}
 override async revokeParentSockets(){return runCaptureWriter(this,'device.revoke','urgent',this.ctx,()=>super.revokeParentSockets());}
 override async restoreRecoveryState(deviceId:string,serialized:string,sha256:string){return runCaptureWriter(this,'device.restore','ordinary',this.ctx,()=>super.restoreRecoveryState(deviceId,serialized,sha256));}
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
