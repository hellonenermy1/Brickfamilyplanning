import {DurableObject} from 'cloudflare:workers';
import {runCardfreeMaintenance,type CardfreeEnv} from './worker-beta-cardfree';

/** Dedicated SQLite alarm: never shares or overwrites a device's WebSocket expiry alarm. */
export class BetaScheduler extends DurableObject<CardfreeEnv>{
 private running:Promise<void>|null=null;
 async arm(){const now=Date.now(),next=await this.ctx.storage.getAlarm();if(next===null||next>now+60000)await this.ctx.storage.setAlarm(now+60000);return {armed:true};}
 async kick(){
  await this.arm();
  const last=await this.ctx.storage.get<{atMs:number}>('lastTick');
  if(!this.running&&(!last||last.atMs<=Date.now()-60000)){
   this.running=this.runTick().catch(()=>{}).finally(()=>{this.running=null;});
   this.ctx.waitUntil(this.running);
  }
  return {scheduled:true};
 }
 async status(){return {nextAlarmAt:await this.ctx.storage.getAlarm(),lastTick:await this.ctx.storage.get<{atMs:number;status:string}>('lastTick')??null};}
 async runTick(){
  const previous=await this.ctx.storage.get<{lastSuccessAtMs?:number;atMs:number;status:string}>('lastTick');
  try{const status=await runCardfreeMaintenance(this.env,this.ctx as unknown as ExecutionContext);await this.ctx.storage.put('lastTick',{atMs:Date.now(),status,lastSuccessAtMs:status==='COMPLETED'?Date.now():previous?.lastSuccessAtMs??null});}
  catch{await this.ctx.storage.put('lastTick',{atMs:Date.now(),status:'FAILED',errorCode:'maintenance_failed',lastSuccessAtMs:previous?.lastSuccessAtMs??(previous?.status==='COMPLETED'?previous.atMs:null)});throw Error('beta_maintenance_failed');}
  finally{await this.ctx.storage.setAlarm(Date.now()+60000);}
 }
 async alarm(){await this.runTick();}
}
