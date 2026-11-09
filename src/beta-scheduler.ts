import {runCaptureWriter} from './capture-writer-boundary';
import {stagedCaptureDatabases} from './capture-d1-boundary';
import {DurableObject} from 'cloudflare:workers';
import {runCardfreeMaintenance,runCardfreeMaintenanceGroup,cardfreeRuntime,type CardfreeEnv} from './worker-beta-cardfree';
import {watchdogPage,checkWatchdogDevice} from './watchdog-work';
import {runBackgroundWork} from './background-work';
import {cleanupPhase5RefinedHistory,processRefinementsForDevice} from './phase5-refined-history';
import {refreshCommutes} from './commute-summary';
import {snapshotD1ToR2} from './backup-v6';
import {d1WorkBudget} from './d1-work-budget';
import type {DerivedKind} from './derived-work-dispatch';

/** Dedicated SQLite alarm: never shares or overwrites a device's WebSocket expiry alarm. */
export class BetaScheduler extends DurableObject<CardfreeEnv>{
 constructor(ctx:DurableObjectState,env:CardfreeEnv){super(ctx,stagedCaptureDatabases(env,ctx));}
 private running:Promise<void>|null=null;
 private tick:Promise<void>|null=null;
 private watchdogRunning:ReturnType<typeof watchdogPage>|null=null;
 async runWatchdogPage(){
  if(this.watchdogRunning)return this.watchdogRunning;
  this.watchdogRunning=runCaptureWriter(this,'scheduler.watchdog-page','urgent',this.ctx,scoped=>{
   const env=stagedCaptureDatabases(this.env,scoped),budget=d1WorkBudget(env.DB,44);
   return watchdogPage(budget.db,id=>env.BETA_SCHEDULER.get(env.BETA_SCHEDULER.idFromName('watchdog-'+id)).runWatchdogDevice(id));
  }).finally(()=>{this.watchdogRunning=null;});return this.watchdogRunning;
 }
 async runWatchdogDevice(id:string){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw Error('invalid watchdog device');
  return runCaptureWriter(this,'scheduler.watchdog-device','urgent',this.ctx,scoped=>{
   const env=stagedCaptureDatabases(this.env,scoped),budget=d1WorkBudget(env.DB,44);
   return runBackgroundWork(env.DB,'watchdog',id,()=>checkWatchdogDevice(budget.db,id,event=>env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(id)).pushSafetyEvent(event)));
  });
 }
 // Routine groups never use the independent urgent-outage capability.
 async runGroup(group:'minute'|'daily'){
  if(!['minute','daily'].includes(group))throw Error('invalid maintenance group');
  return runCaptureWriter(this,'scheduler.group','ordinary',this.ctx,scoped=>runCardfreeMaintenanceGroup(stagedCaptureDatabases(this.env,scoped),scoped,group));
 }
 async runDerivedWork(kind:DerivedKind,deviceId:string){
  if(!['refinement','commute'].includes(kind)||!/^[A-Za-z0-9_-]{1,128}$/.test(deviceId))throw Error('invalid derived work');
  return runCaptureWriter(this,'scheduler.derived','ordinary',this.ctx,scoped=>{
   const env=stagedCaptureDatabases(this.env,scoped),budget=d1WorkBudget(env.DB,44),runtime=cardfreeRuntime({...env,DB:budget.db}),now=Date.now();
   return runBackgroundWork(env.DB,kind,deviceId,()=>kind==='refinement'?processRefinementsForDevice(runtime,deviceId,now):refreshCommutes(runtime,deviceId,now-2*86400000,now));
  });
 }
 async runRetentionWork(){return runCaptureWriter(this,'scheduler.retention','ordinary',this.ctx,scoped=>{
  const env=stagedCaptureDatabases(this.env,scoped),budget=d1WorkBudget(env.DB,44);
  return runBackgroundWork(env.DB,'refined-retention','global',()=>cleanupPhase5RefinedHistory(cardfreeRuntime({...env,DB:budget.db})));
 });}
 async runDailyBackup(){return runCaptureWriter(this,'scheduler.backup','ordinary',this.ctx,scoped=>{
  const env=stagedCaptureDatabases(this.env,scoped),budget=d1WorkBudget(env.DB,48);
  return snapshotD1ToR2(cardfreeRuntime({...env,DB:budget.db}));
 });}
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
 async runTick(){if(this.tick)return this.tick;this.tick=this.performTick().finally(()=>{this.tick=null;});return this.tick;}
 private async performTick(){
  let nextDelayMs=60000;
  const previous=await this.ctx.storage.get<{lastSuccessAtMs?:number;atMs:number;status:string}>('lastTick');
  try{let status=await runCardfreeMaintenance(this.env,this.ctx as unknown as ExecutionContext,ms=>{nextDelayMs=ms;});
   if(status==='COMPLETED'){const pending=await this.env.DB.prepare("SELECT COUNT(*) n FROM provider_cache p WHERE p.provider='brick_background_v1' AND p.expires_at>?1 AND json_valid(p.value_json) AND json_extract(p.value_json,'$.status')='PENDING' AND (p.cache_key='refined-retention/global' OR EXISTS(SELECT 1 FROM devices d WHERE p.cache_key='commute/'||d.id AND d.revoked_at IS NULL))").bind(Date.now()).first<{n:number}>();if(Number(pending?.n)>0)status='PENDING';}
   await this.ctx.storage.put('lastTick',{atMs:Date.now(),status,lastSuccessAtMs:status==='COMPLETED'?Date.now():previous?.lastSuccessAtMs??null});}
  catch{await this.ctx.storage.put('lastTick',{atMs:Date.now(),status:'FAILED',errorCode:'maintenance_failed',lastSuccessAtMs:previous?.lastSuccessAtMs??(previous?.status==='COMPLETED'?previous.atMs:null)});throw Error('beta_maintenance_failed');}
  finally{await this.ctx.storage.setAlarm(Date.now()+nextDelayMs);}
 }
 async alarm(){await this.runTick();}
}
