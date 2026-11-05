import {DurableObject} from 'cloudflare:workers';
import {runCardfreeMaintenance,runCardfreeMaintenanceGroup,cardfreeRuntime,type CardfreeEnv} from './worker-beta-cardfree';
import {runBackgroundWork} from './background-work';
import {processRefinementsForDevice} from './phase5-refined-history';
import {refreshCommutes} from './commute-summary';
import {snapshotD1ToR2} from './backup-v6';
import {d1WorkBudget} from './d1-work-budget';
import type {DerivedKind} from './derived-work-dispatch';

/** Dedicated SQLite alarm: never shares or overwrites a device's WebSocket expiry alarm. */
export class BetaScheduler extends DurableObject<CardfreeEnv>{
 private running:Promise<void>|null=null;
 // These internal RPCs use separate named objects/invocations, not the device
 // DO or its alarm. They hold no authoritative DO state; D1 owns work receipts.
 async runGroup(group:'minute'|'daily'){return runCardfreeMaintenanceGroup(this.env,this.ctx as unknown as ExecutionContext,group);}
 async runDerivedWork(kind:DerivedKind,deviceId:string){
  if(!['refinement','commute'].includes(kind)||!/^[A-Za-z0-9_-]{1,128}$/.test(deviceId))throw Error('invalid derived work');
  // Two raw receipt queries +44 computation statements +success/failure finish
  // stay below50, even if a finish attempt itself fails. No billing dependency.
  const budget=d1WorkBudget(this.env.DB,44),runtime=cardfreeRuntime({...this.env,DB:budget.db}),now=Date.now();
  return runBackgroundWork(this.env.DB,kind,deviceId,()=>kind==='refinement'?processRefinementsForDevice(runtime,deviceId,now):refreshCommutes(runtime,deviceId,now-2*86400000,now));
 }
 async runDailyBackup(){const budget=d1WorkBudget(this.env.DB,48);return snapshotD1ToR2(cardfreeRuntime({...this.env,DB:budget.db}));}
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
