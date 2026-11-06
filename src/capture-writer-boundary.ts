// Inert until a trusted in-isolate bootstrap explicitly installs a controller.
// No production bootstrap, env flag, binding, HTTP/RPC activation or urgent-outage
// bypass is provided. Partial hook coverage must never enable source capture.
type Ticket={authorityEpoch:string;writerId:string;tracked:boolean};
export type CaptureWriterPriority='ordinary'|'urgent';
export type CaptureWriterNotice='ADMISSION_UNCERTAIN'|'LATE_ADMISSION_CLEANUP'|'RELEASE_UNCERTAIN'|'DEFERRED_REJECTED'|'WORK_REJECTED'|'CONTEXT_REJECTED'|'LATE_WORK_UNACCOUNTED';
export type CaptureWriterController={
 enterWriter(writerId:string,priority:CaptureWriterPriority):Promise<{admitted:boolean;ticket?:Ticket}>;
 exitWriter(ticket:Ticket):Promise<{released:boolean}>;
 notice(code:CaptureWriterNotice,operation:string):unknown;
 timeoutMs?:number;
};
type Context=Pick<ExecutionContext,'waitUntil'> & Partial<Pick<ExecutionContext,'passThroughOnException'>>;
type Installed={enter:CaptureWriterController['enterWriter'];exit:CaptureWriterController['exitWriter'];notice:CaptureWriterController['notice'];timeoutMs:number};
const controllers=new WeakMap<object,Installed>();
// Internal adapter discovery only; this does not install or activate a controller.
export function stagedCaptureWriterConfigured(owner:object){return controllers.has(owner);}
const hex32=(x:unknown)=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
function validTicket(x:unknown,writerId:string):x is Ticket{return x!==null&&typeof x==='object'&&Object.keys(x).sort().join(',')==='authorityEpoch,tracked,writerId'&&hex32((x as Ticket).authorityEpoch)&&(x as Ticket).writerId===writerId&&typeof (x as Ticket).tracked==='boolean';}
export function installStagedCaptureWriterController(owner:object,controller:CaptureWriterController){
 const timeout=controller?.timeoutMs??1000;
 if(!owner||typeof owner!=='object'||controllers.has(owner)||typeof controller?.enterWriter!=='function'||typeof controller.exitWriter!=='function'||typeof controller.notice!=='function'||!Number.isSafeInteger(timeout)||timeout<5||timeout>15000)throw Error('CAPTURE_WRITER_CONTROLLER_INVALID');
 controllers.set(owner,Object.freeze({enter:controller.enterWriter.bind(controller),exit:controller.exitWriter.bind(controller),notice:controller.notice.bind(controller),timeoutMs:timeout}));
}
function report(c:Installed,code:CaptureWriterNotice,operation:string){try{Promise.resolve(c.notice(code,operation)).catch(()=>{});}catch{} }
async function bounded<T>(p:Promise<T>,ms:number){let timer:ReturnType<typeof setTimeout>|undefined;const deadline=performance.now()+ms;try{const result=await Promise.race([p,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('CAPTURE_WRITER_TRANSPORT_TIMEOUT')),ms);})]);if(performance.now()>=deadline)throw Error('CAPTURE_WRITER_TRANSPORT_TIMEOUT');return result;}finally{clearTimeout(timer);}}
function schedule(parent:Context,promise:Promise<unknown>,c:Installed,operation:string){const safe=promise.catch(()=>{report(c,'RELEASE_UNCERTAIN',operation);});try{parent.waitUntil(safe);}catch{report(c,'CONTEXT_REJECTED',operation);} }
export async function runCaptureWriter<T>(owner:object,operation:string,priority:CaptureWriterPriority,parent:Context,work:(scoped:ExecutionContext)=>Promise<T>):Promise<T>{
 const installed=controllers.get(owner);if(!installed)return work(parent as ExecutionContext);const c=installed;
 if(!/^[a-z][a-z0-9.-]{0,79}$/.test(operation)||!['ordinary','urgent'].includes(priority))throw Error('CAPTURE_WRITER_OPERATION_INVALID');
 const writerId=crypto.randomUUID().replaceAll('-','');
 const request=Promise.resolve().then(()=>c.enter(writerId,priority));let admission;
 try{admission=await bounded(request,c.timeoutMs);}catch{
  report(c,'ADMISSION_UNCERTAIN',operation);
  // A lost/late reply can leave a durable ticket. Work has NOT started. Clean up
  // only the correctly bound late ticket; never erase unknown ownership on timeout.
  schedule(parent,request.then(async late=>{if(late?.admitted===true&&validTicket(late.ticket,writerId)){const r=await bounded(Promise.resolve().then(()=>c.exit(late.ticket!)),c.timeoutMs);if(r?.released!==true)throw Error('late release uncertain');report(c,'LATE_ADMISSION_CLEANUP',operation);}}),c,operation);
  throw Error('CAPTURE_WRITER_ADMISSION_UNCERTAIN');
 }
 if(admission?.admitted===false)throw Error('CAPTURE_WRITER_BUSY');
 if(admission?.admitted!==true||!validTicket(admission.ticket,writerId)){report(c,'ADMISSION_UNCERTAIN',operation);throw Error('CAPTURE_WRITER_ADMISSION_UNCERTAIN');}
 const ticket={...admission.ticket};let closed=false;const pending:Promise<boolean>[]=[];
 const waitUntil=(value:Promise<unknown>)=>{const observed=Promise.resolve(value).then(()=>true,()=>{report(c,'DEFERRED_REJECTED',operation);return false;});if(closed){report(c,'LATE_WORK_UNACCOUNTED',operation);throw Error('CAPTURE_WRITER_SCOPE_CLOSED');}pending.push(observed);};
 const scoped=new Proxy(parent,{get(target,key){if(key==='waitUntil')return waitUntil;const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}) as ExecutionContext;
 async function finish(){
  for(let next=0;next<pending.length;){const batch=pending.slice(next);next=pending.length;await Promise.all(batch);}
  closed=true;
  // Do not put a timeout on work/deferred settlement and then release ownership.
  // A permanently unresolved task leaves its writer durable and blocks capture.
  const result=await bounded(Promise.resolve().then(()=>c.exit(ticket)),c.timeoutMs);
  if(result?.released!==true)throw Error('capture writer release uncertain');
 }
 try{return await work(scoped);}catch(error){report(c,'WORK_REJECTED',operation);throw error;}
 finally{schedule(parent,finish(),c,operation);}
}
