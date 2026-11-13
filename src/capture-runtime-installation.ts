// Trusted in-isolate enrollment capability only. No env flag, network/default
// client, state creation, HTTP route, key storage or production entry imports it.
import {installStagedCaptureWriterControllers,stagedCaptureWriterConfigured,type CaptureWriterController} from './capture-writer-boundary';

export function createStagedRuntimeCaptureInstaller(input:CaptureWriterController){
 const required=['enterWriter','exitWriter','notice','getScope','enterDescendantWriter','startWriter','cancelReservation','quarantineUrgent'] as const;
 if(!input||required.some(k=>typeof input[k]!=='function'))throw Error('RUNTIME_CAPTURE_INSTALLATION_INVALID');
 const timeout=input.timeoutMs??1000;
 if(!Number.isSafeInteger(timeout)||timeout<5||timeout>15000)throw Error('RUNTIME_CAPTURE_INSTALLATION_INVALID');
 // Snapshot callable capabilities before enrollment; later input mutation cannot
 // replace only part of an installed local resource set.
 const controller:CaptureWriterController={enterWriter:input.enterWriter.bind(input),exitWriter:input.exitWriter.bind(input),notice:input.notice.bind(input),getScope:input.getScope!.bind(input),enterDescendantWriter:input.enterDescendantWriter!.bind(input),startWriter:input.startWriter!.bind(input),cancelReservation:input.cancelReservation!.bind(input),quarantineUrgent:input.quarantineUrgent!.bind(input),...(input.timeoutMs!==undefined?{timeoutMs:input.timeoutMs}:{})};
 controller.timeoutMs=timeout;
 const owned=new WeakSet<object>(),bindings=new WeakMap<object,{DB:D1Database;BETA_DB:D1Database}>();
 return Object.freeze({
  install(owner:object,env:{DB:D1Database;BETA_DB:D1Database}){
   if(!owner||typeof owner!=='object'||!env||typeof env!=='object')throw Error('RUNTIME_CAPTURE_INSTALLATION_INVALID');
   const {DB,BETA_DB}=env;
   if(!DB||!BETA_DB||DB===BETA_DB||[DB,BETA_DB].some(db=>typeof db!=='object'||typeof db.prepare!=='function'||typeof db.batch!=='function'))throw Error('RUNTIME_CAPTURE_INSTALLATION_INVALID');
   const prior=bindings.get(owner);
   if(prior&&(prior.DB!==DB||prior.BETA_DB!==BETA_DB))throw Error('RUNTIME_CAPTURE_INSTALLATION_CONFLICT');
   const targets=[...new Set<object>([owner,DB,BETA_DB])];
   if(targets.some(t=>stagedCaptureWriterConfigured(t)!==owned.has(t)))throw Error('RUNTIME_CAPTURE_INSTALLATION_CONFLICT');
   const pending=targets.filter(t=>!owned.has(t));
   if(!pending.length){bindings.set(owner,{DB,BETA_DB});return;}
   installStagedCaptureWriterControllers(pending,controller);
   for(const target of pending)owned.add(target);
   bindings.set(owner,{DB,BETA_DB});
  }
 });
}
