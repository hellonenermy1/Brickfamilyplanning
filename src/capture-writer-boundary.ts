// Inert until a trusted in-isolate bootstrap explicitly installs a controller.
// No production bootstrap, env flag, binding or HTTP/RPC activation is provided.
// Urgent outage fallback requires an independently durable capture quarantine. Partial hook coverage must never enable source capture.
type Ticket={authorityEpoch:string;writerId:string;tracked:boolean};
export type CaptureWriterPriority='ordinary'|'urgent';
export type CaptureWriterNotice='ADMISSION_UNCERTAIN'|'LATE_ADMISSION_CLEANUP'|'RELEASE_UNCERTAIN'|'DEFERRED_REJECTED'|'WORK_REJECTED'|'WORK_OUTCOME_UNCERTAIN'|'CONTEXT_REJECTED'|'LATE_WORK_UNACCOUNTED'|'RESERVATION_CANCELLED'|'CANCELLATION_UNCERTAIN'|'START_UNCERTAIN'|'URGENT_QUARANTINED'|'URGENT_QUARANTINE_UNCERTAIN'|'SCOPE_UNCERTAIN';
export type CaptureWriterParent={format:'brick-writer-parent-v1';authorityEpoch:string;sourceSha:string;resourceSetSha256:string;writerId:string;operation:'scheduler.derived'|'scheduler.retention'|'scheduler.backup'};
export type CaptureWriterController={
 enterDescendantWriter?(writerId:string,parent:Ticket):Promise<{admitted:boolean;ticket?:Ticket;requiresStart?:boolean}>;
 enterWriter(writerId:string,priority:CaptureWriterPriority):Promise<{admitted:boolean;ticket?:Ticket;requiresStart?:boolean}>;
 startWriter?(ticket:Ticket,priority:CaptureWriterPriority):Promise<{started:boolean}>;
 cancelReservation?(writerId:string,priority:CaptureWriterPriority):Promise<{cancelled:boolean}>;
 exitWriter(ticket:Ticket):Promise<{released:boolean}>;
 notice(code:CaptureWriterNotice,operation:string):unknown;
 quarantineUrgent?(writerId:string,operation:string):Promise<{quarantined:true;writerId:string}>;
 timeoutMs?:number;
 getScope?():Promise<object>;
};
type Context=Pick<ExecutionContext,'waitUntil'> & Partial<Pick<ExecutionContext,'passThroughOnException'>>;
type Installed={descendant?:CaptureWriterController['enterDescendantWriter'];enter:CaptureWriterController['enterWriter'];exit:CaptureWriterController['exitWriter'];notice:CaptureWriterController['notice'];timeoutMs:number;start?:CaptureWriterController['startWriter'];cancel?:CaptureWriterController['cancelReservation'];quarantine?:CaptureWriterController['quarantineUrgent'];getScope?:CaptureWriterController['getScope']};
const controllers=new WeakMap<object,Installed>();
type ScopePin={authorityEpoch:string;sourceSha:string;resourceSetSha256:string};
const scopePins=new WeakMap<object,Readonly<ScopePin>>();
const childScopes=new WeakMap<object,{token:object;parent?:Omit<CaptureWriterParent,'operation'>;run<T>(work:()=>Promise<T>):Promise<T>}>();
// Trusted in-isolate capability only. No serialized object/header can recreate it.
export function createStagedCaptureWriterScope(pin:ScopePin):object{
 if(!pin||Object.keys(pin).sort().join(',')!=='authorityEpoch,resourceSetSha256,sourceSha'||!hex32(pin.authorityEpoch)||typeof pin.sourceSha!=='string'||typeof pin.resourceSetSha256!=='string'||!(/^[a-f0-9]{40}$/).test(pin.sourceSha)||!(/^[a-f0-9]{64}$/).test(pin.resourceSetSha256))throw Error('CAPTURE_WRITER_SCOPE_INVALID');
 const token=Object.freeze({});scopePins.set(token,Object.freeze({...pin}));return token;
}
// Internal adapter discovery only; this does not install or activate a controller.
export function stagedCaptureWriterConfigured(owner:object){return controllers.has(owner);}
const hex32=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
function validTicket(x:unknown,writerId:string):x is Ticket{return x!==null&&typeof x==='object'&&Object.keys(x).sort().join(',')==='authorityEpoch,tracked,writerId'&&hex32((x as Ticket).authorityEpoch)&&(x as Ticket).writerId===writerId&&typeof (x as Ticket).tracked==='boolean';}
export function installStagedCaptureWriterController(owner:object,controller:CaptureWriterController){
 installStagedCaptureWriterControllers([owner],controller);
}
// One synchronous local enrollment boundary. Validate every owner/controller
// before changing any WeakMap entry; no asynchronous/network work occurs here.
export function installStagedCaptureWriterControllers(owners:object[],controller:CaptureWriterController){
 if(!Array.isArray(owners))throw Error('CAPTURE_WRITER_CONTROLLER_INVALID');
 const selected=[...owners];
 const timeout=controller?.timeoutMs??1000;
 if(!selected.length||selected.length>64||new Set(selected).size!==selected.length||selected.some(owner=>!owner||typeof owner!=='object'||controllers.has(owner))||typeof controller?.enterWriter!=='function'||typeof controller.exitWriter!=='function'||typeof controller.notice!=='function'||!Number.isSafeInteger(timeout)||timeout<5||timeout>15000)throw Error('CAPTURE_WRITER_CONTROLLER_INVALID');
 if((controller.startWriter!==undefined||controller.cancelReservation!==undefined)&&(typeof controller.startWriter!=='function'||typeof controller.cancelReservation!=='function'))throw Error('CAPTURE_WRITER_CONTROLLER_INVALID');
 if(controller.quarantineUrgent!==undefined&&typeof controller.quarantineUrgent!=='function')throw Error('CAPTURE_WRITER_CONTROLLER_INVALID');
 if(controller.enterDescendantWriter!==undefined&&typeof controller.enterDescendantWriter!=='function')throw Error('CAPTURE_WRITER_CONTROLLER_INVALID');
 if(controller.getScope!==undefined&&typeof controller.getScope!=='function')throw Error('CAPTURE_WRITER_CONTROLLER_INVALID');
 const installed=Object.freeze({enter:controller.enterWriter.bind(controller),exit:controller.exitWriter.bind(controller),notice:controller.notice.bind(controller),timeoutMs:timeout,...(controller.enterDescendantWriter?{descendant:controller.enterDescendantWriter.bind(controller)}:{}),...(controller.getScope?{getScope:controller.getScope.bind(controller)}:{}),...(controller.quarantineUrgent?{quarantine:controller.quarantineUrgent.bind(controller)}:{}),...(controller.startWriter?{start:controller.startWriter.bind(controller),cancel:controller.cancelReservation!.bind(controller)}:{})});
 // Trusted capability getters may reenter installation; never overwrite an
 // owner enrolled during controller materialization.
 if(selected.some(owner=>controllers.has(owner)))throw Error('CAPTURE_WRITER_CONTROLLER_INVALID');
 for(const owner of selected)controllers.set(owner,installed);
}
function report(c:Installed,code:CaptureWriterNotice,operation:string){try{Promise.resolve(c.notice(code,operation)).catch(()=>{});}catch{} }
async function bounded<T>(p:Promise<T>,ms:number){let timer:ReturnType<typeof setTimeout>|undefined;const deadline=performance.now()+ms;try{const result=await Promise.race([p,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('CAPTURE_WRITER_TRANSPORT_TIMEOUT')),ms);})]);if(performance.now()>=deadline)throw Error('CAPTURE_WRITER_TRANSPORT_TIMEOUT');return result;}finally{clearTimeout(timer);}}
function schedule(parent:Context,promise:Promise<unknown>,c:Installed,operation:string){const safe=promise.catch(()=>{report(c,'RELEASE_UNCERTAIN',operation);});try{parent.waitUntil(safe);}catch{report(c,'CONTEXT_REJECTED',operation);} }
async function cancelUnstarted(c:Installed,writerId:string,priority:CaptureWriterPriority,operation:string){try{const result=await bounded(Promise.resolve().then(()=>c.cancel!(writerId,priority)),c.timeoutMs);if(result?.cancelled!==true)throw Error('uncertain cancellation');report(c,'RESERVATION_CANCELLED',operation);}catch{report(c,'CANCELLATION_UNCERTAIN',operation);}}
async function resolveScope(c:Installed){
 if(!c.getScope)return undefined;
 try{const token=await bounded(Promise.resolve().then(()=>c.getScope!()),c.timeoutMs);if(!token||typeof token!=='object'||!scopePins.has(token))throw Error('unknown scope');return token;}catch{throw Error('CAPTURE_WRITER_SCOPE_UNCERTAIN');}
}
// A failed scope lookup is not permission. Urgent source work needs the same
// independent durable quarantine and request proof as an admission outage.
async function quarantineScopeOrAdmission(c:Installed,writerId:string,operation:string,fallbackAllowed?:()=>Promise<boolean>){
 if(!c.quarantine)return false;
 if(fallbackAllowed){try{if(await bounded(Promise.resolve().then(fallbackAllowed),c.timeoutMs)!==true)return false;}catch{return false;}}
 try{const result=await bounded(Promise.resolve().then(()=>c.quarantine!(writerId,operation)),c.timeoutMs);if(!result||Object.keys(result).sort().join(',')!=='quarantined,writerId'||result.quarantined!==true||result.writerId!==writerId)throw Error('quarantine receipt invalid');report(c,'URGENT_QUARANTINED',operation);return true;}catch{report(c,'URGENT_QUARANTINE_UNCERTAIN',operation);throw Error('CAPTURE_WRITER_URGENT_QUARANTINE_UNCERTAIN');}
}
export function runCaptureWriterDescendant<T>(owner:object,operation:string,parent:Context,work:()=>Promise<T>):Promise<T>{
 if(!/^d1\.(run|first|all|raw|batch|exec)$/.test(operation))return Promise.reject(Error('CAPTURE_WRITER_OPERATION_INVALID'));
 const inherited=childScopes.get(parent),c=controllers.get(owner);
 if(!inherited||!c)return runCaptureWriter(owner,operation,'urgent',parent,()=>work());
 return inherited.run(async()=>{
  let token;try{token=await resolveScope(c);}catch(error){report(c,'SCOPE_UNCERTAIN',operation);if(!await quarantineScopeOrAdmission(c,crypto.randomUUID().replaceAll('-',''),operation))throw error;return work();}
  // Foreign/missing scope keeps independent admission and ownership.
  if(token!==inherited.token)return runCaptureWriter(owner,operation,'urgent',parent,()=>work());
  return work();
 });
}
// Internal outgoing RPC registration. A serialized hint grants no permission:
// the receiver's signed broker must durably admit a child of this STARTED parent.
export function runCaptureWriterRpc<T>(operation:CaptureWriterParent['operation'],context:Context|undefined,work:(parent?:CaptureWriterParent)=>Promise<T>):Promise<T>{
 if(!['scheduler.derived','scheduler.retention','scheduler.backup'].includes(operation))return Promise.reject(Error('CAPTURE_WRITER_OPERATION_INVALID'));
 const scope=context&&childScopes.get(context);
 if(!scope)return work();
 return scope.run(()=>work(scope.parent?{...scope.parent,operation}:undefined));
}
function validParent(value:CaptureWriterParent,pin:ScopePin,operation:string){
 return value&&typeof value==='object'&&Object.keys(value).sort().join(',')==='authorityEpoch,format,operation,resourceSetSha256,sourceSha,writerId'&&value.format==='brick-writer-parent-v1'&&value.authorityEpoch===pin.authorityEpoch&&value.sourceSha===pin.sourceSha&&value.resourceSetSha256===pin.resourceSetSha256&&hex32(value.writerId)&&value.operation===operation&&['scheduler.derived','scheduler.retention','scheduler.backup'].includes(operation);
}
export async function runCaptureWriter<T>(owner:object,operation:string,inputPriority:CaptureWriterPriority|(()=>Promise<CaptureWriterPriority>),parent:Context,work:(scoped:ExecutionContext)=>Promise<T>,fallbackAllowed?:()=>Promise<boolean>,rpcParent?:CaptureWriterParent):Promise<T>{
 const installed=controllers.get(owner);if(!installed&&rpcParent!==undefined)throw Error('CAPTURE_WRITER_PARENT_UNVERIFIED');if(!installed)return work(parent as ExecutionContext);const c=installed;
 let scope:object|undefined;
 let priority:CaptureWriterPriority;
 try{priority=typeof inputPriority==='function'?await bounded(Promise.resolve().then(inputPriority),c.timeoutMs):inputPriority;}catch{throw Error('CAPTURE_WRITER_PRIORITY_UNCERTAIN');}
 if(!/^[a-z][a-z0-9.-]{0,79}$/.test(operation)||!['ordinary','urgent'].includes(priority))throw Error('CAPTURE_WRITER_OPERATION_INVALID');

 const writerId=crypto.randomUUID().replaceAll('-','');
 let quarantined=false;
 async function urgentFallback(){
  if(priority!=='urgent')return false;
  if(!await quarantineScopeOrAdmission(c,writerId,operation,fallbackAllowed))return false;
  quarantined=true;return true;
 }
 // Never let an urgent caller use an invalid serialized parent to trigger poison.
 if(rpcParent!==undefined&&priority!=='ordinary')throw Error('CAPTURE_WRITER_PARENT_UNVERIFIED');
 try{scope=await resolveScope(c);}catch(error){report(c,'SCOPE_UNCERTAIN',operation);if(!await urgentFallback())throw error;}
 if(rpcParent!==undefined){rpcParent={...rpcParent};if(!scope||!c.descendant||!c.start||priority!=='ordinary'||!validParent(rpcParent,scopePins.get(scope)!,operation))throw Error('CAPTURE_WRITER_PARENT_UNVERIFIED');}
 let admission;
 if(!quarantined){
 const request=Promise.resolve().then(()=>rpcParent?c.descendant!(writerId,{authorityEpoch:rpcParent.authorityEpoch,writerId:rpcParent.writerId,tracked:true}):c.enter(writerId,priority));
 try{admission=await bounded(request,c.timeoutMs);}catch{
  report(c,'ADMISSION_UNCERTAIN',operation);
  // A lost/late reply can leave a durable ticket. Work has NOT started. Clean up
  // only the correctly bound late ticket; never erase unknown ownership on timeout.
  schedule(parent,c.cancel?cancelUnstarted(c,writerId,priority,operation):request.then(async late=>{if(late?.admitted===true&&validTicket(late.ticket,writerId)&&late.requiresStart!==true){const r=await bounded(Promise.resolve().then(()=>c.exit(late.ticket!)),c.timeoutMs);if(r?.released!==true)throw Error('late release uncertain');report(c,'LATE_ADMISSION_CLEANUP',operation);}}),c,operation);
  if(!await urgentFallback())throw Error('CAPTURE_WRITER_ADMISSION_UNCERTAIN');
 }
 }
 if(!quarantined&&admission?.admitted===false)throw Error('CAPTURE_WRITER_BUSY');
 if(!quarantined&&(admission?.admitted!==true||!validTicket(admission.ticket,writerId)||scope&&admission.ticket.authorityEpoch!==scopePins.get(scope)!.authorityEpoch||(admission.requiresStart===true)!==Boolean(c.start))){report(c,'ADMISSION_UNCERTAIN',operation);if(c.cancel)schedule(parent,cancelUnstarted(c,writerId,priority,operation),c,operation);throw Error('CAPTURE_WRITER_ADMISSION_UNCERTAIN');}
 const ticket=admission?.ticket?{...admission.ticket}:undefined;
 if(!quarantined&&c.start){try{const result=await bounded(Promise.resolve().then(()=>c.start!({...ticket!},priority)),c.timeoutMs);if(result?.started!==true)throw Error('start unconfirmed');}catch{report(c,'START_UNCERTAIN',operation);schedule(parent,cancelUnstarted(c,writerId,priority,operation),c,operation);if(!await urgentFallback())throw Error('CAPTURE_WRITER_START_UNCERTAIN');}}
 let closed=false,workRejected=false,deferredRejected=false;const pending:Promise<boolean>[]=[];
 const waitUntil=(value:Promise<unknown>)=>{const observed=Promise.resolve(value).then(()=>true,()=>{deferredRejected=true;report(c,'DEFERRED_REJECTED',operation);return false;});if(closed){report(c,'LATE_WORK_UNACCOUNTED',operation);throw Error('CAPTURE_WRITER_SCOPE_CLOSED');}pending.push(observed);};
 const scoped=new Proxy(parent,{get(target,key){if(key==='waitUntil')return waitUntil;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}) as ExecutionContext;
 if(scope)childScopes.set(scoped,{token:scope,...(!quarantined&&ticket?.tracked&&c.start?{parent:{format:'brick-writer-parent-v1' as const,...scopePins.get(scope)!,writerId:ticket.writerId}}:{}),run<T>(child:()=>Promise<T>){
  if(closed)throw Error('CAPTURE_WRITER_SCOPE_CLOSED');
  const promise=Promise.resolve().then(child);
  pending.push(promise.then(()=>true,()=>{deferredRejected=true;report(c,'DEFERRED_REJECTED',operation);return false;}));
  return promise;
 }});
 async function finish(){
  for(let next=0;next<pending.length;){const batch=pending.slice(next);next=pending.length;await Promise.all(batch);}
  closed=true;
  // Promise rejection is not proof that a remote write stopped/rolled back.
  // Even after registered descendants settle, retain uncertain durable ownership.
  if(workRejected||deferredRejected){report(c,'WORK_OUTCOME_UNCERTAIN',operation);return;}
  // Do not put a timeout on work/deferred settlement and then release ownership.
  // A permanently unresolved task leaves its writer durable and blocks capture.
  // Fallback quarantine is permanent, including after successful work. Never
  // pretend its synthetic permission is a normal releasable authority ticket.
  if(quarantined)return;
  const result=await bounded(Promise.resolve().then(()=>c.exit(ticket!)),c.timeoutMs);
  if(result?.released!==true)throw Error('capture writer release uncertain');
 }
 try{return await work(scoped);}catch(error){workRejected=true;report(c,'WORK_REJECTED',operation);throw error;}
 finally{schedule(parent,finish(),c,operation);}
}
