// No default production installation or env activation flag. An explicit pinned
// CLI launcher or test bootstrap can configure this shared module instance.
// Direct tool execution remains inert and needs operational bypass restrictions.
import {randomBytes} from 'node:crypto';
let installed=null;
const hex=(x,n)=>typeof x==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(x);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x);
const host=x=>typeof x==='string'&&/^brick-family-beta\.[a-z0-9-]+\.workers\.dev$/.test(x);
const operations=new Set(['publication','probe','schema','deployment']);
function validTicket(t,id){return t&&Object.keys(t).sort().join(',')==='authorityEpoch,tracked,writerId'&&hex(t.authorityEpoch,32)&&t.writerId===id&&t.tracked===true;}
function report(c,code,operation){try{Promise.resolve(c.notice(code,operation)).catch(()=>{});}catch{}}
async function bounded(p,ms){let timer;const deadline=performance.now()+ms;try{const value=await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('EXTERNAL_WRITER_TIMEOUT')),ms);})]);if(performance.now()>=deadline)throw Error('EXTERNAL_WRITER_TIMEOUT');return value;}finally{clearTimeout(timer);}}
export function installStagedExternalWriterController(pin,controller){
 const timeoutMs=controller?.timeoutMs??1000;
 if(installed||!pin||!hex(pin.sourceSha,40)||!hex(pin.accountId,32)||!hex(pin.resourceSetSha256,64)||pin.workerName!=='brick-family-beta'||!host(pin.workerHost)||!Array.isArray(pin.databaseIds)||!pin.databaseIds.length||pin.databaseIds.some(x=>!uuid(x))||new Set(pin.databaseIds).size!==pin.databaseIds.length||!['enter','exit','notice'].every(k=>typeof controller?.[k]==='function')||!Number.isSafeInteger(timeoutMs)||timeoutMs<5||timeoutMs>15000)throw Error('EXTERNAL_WRITER_CONTROLLER_INVALID');
 if((controller.start!==undefined||controller.cancel!==undefined)&&(typeof controller.start!=='function'||typeof controller.cancel!=='function'))throw Error('EXTERNAL_WRITER_CONTROLLER_INVALID');
 installed=Object.freeze({pin:Object.freeze({...pin,databaseIds:Object.freeze([...pin.databaseIds])}),enter:controller.enter.bind(controller),exit:controller.exit.bind(controller),notice:controller.notice.bind(controller),timeoutMs,...(controller.start?{start:controller.start.bind(controller),cancel:controller.cancel.bind(controller)}:{})});
}
export async function runStagedExternalWriter(operation,scope,work){
 const c=installed;if(!c)return work(Object.freeze({database(){},workerHost(){}}));
 const change=operation==='schema'||operation==='deployment';
 if(!operations.has(operation)||!scope||Object.keys(scope).sort().join(',')!=='accountId,databaseId,sourceSha,workerHost,workerName'||scope.sourceSha!==c.pin.sourceSha||scope.accountId!==c.pin.accountId||scope.workerName!==c.pin.workerName||!(scope.databaseId===null&&operation==='deployment'||c.pin.databaseIds.includes(scope.databaseId))||!(scope.workerHost===null&&change||scope.workerHost===c.pin.workerHost))throw Error('EXTERNAL_WRITER_SCOPE_MISMATCH');
 scope={...scope};
 const writerId=randomBytes(16).toString('hex');const request=Promise.resolve().then(()=>c.enter({writerId,operation,identity:{sourceSha:c.pin.sourceSha,resourceSetSha256:c.pin.resourceSetSha256},scope:{...scope}}));let admission;
 async function cancelUnstarted(){try{const result=await bounded(Promise.resolve().then(()=>c.cancel({writerId,operation})),c.timeoutMs);if(result?.cancelled!==true)throw Error('cancellation unconfirmed');report(c,'RESERVATION_CANCELLED',operation);}catch{report(c,'CANCELLATION_UNCERTAIN',operation);}}
 try{admission=await bounded(request,c.timeoutMs);}catch{
  report(c,'ADMISSION_UNCERTAIN',operation);
  // Work never started. A correctly bound late receipt may be cleaned; otherwise
  // durable authority ownership stays unresolved. No cloud mutation is replayed.
  if(c.cancel)await cancelUnstarted();else request.then(async late=>{if(late?.admitted===true&&validTicket(late.ticket,writerId)&&late.requiresStart!==true){const r=await bounded(Promise.resolve().then(()=>c.exit(late.ticket)),c.timeoutMs);if(r?.released!==true)throw Error('uncertain late exit');}}).catch(()=>report(c,'RELEASE_UNCERTAIN',operation));
  throw Error('EXTERNAL_WRITER_ADMISSION_UNCERTAIN');
 }
 if(admission?.admitted===false)throw Error('EXTERNAL_WRITER_BUSY');
 if(admission?.admitted!==true||!validTicket(admission.ticket,writerId)||change&&admission.quarantined!==true||(admission.requiresStart===true)!==Boolean(c.start)){report(c,'ADMISSION_UNCERTAIN',operation);if(c.cancel)await cancelUnstarted();throw Error('EXTERNAL_WRITER_ADMISSION_UNCERTAIN');}
 const ticket={...admission.ticket};
 if(c.start){try{const result=await bounded(Promise.resolve().then(()=>c.start({...ticket},operation)),c.timeoutMs);if(result?.started!==true)throw Error('start unconfirmed');}catch{report(c,'START_UNCERTAIN',operation);await cancelUnstarted();throw Error('EXTERNAL_WRITER_START_UNCERTAIN');}}
 // The deployment grant has databaseId=null because it spans both stores.
 // Its discovered final targets must still belong to the pinned resource set.
 // These checks never provision/rebind resources or infer safety from a name.
 const targets=Object.freeze({database(id){if(!c.pin.databaseIds.includes(id))throw Error('EXTERNAL_WRITER_TARGET_MISMATCH');},workerHost(value){if(value!==c.pin.workerHost)throw Error('EXTERNAL_WRITER_TARGET_MISMATCH');}});
 let value;try{value=await work(targets);}catch(error){
  // A rejected HTTP/process result does not prove remote side effects stopped.
  // Retain ownership for explicit reconciliation; never replay or expire it.
  report(c,'WORK_OUTCOME_UNCERTAIN',operation);throw error;
 }
 try{const r=await bounded(Promise.resolve().then(()=>c.exit(ticket)),c.timeoutMs);if(r?.released!==true)throw Error('uncertain exit');}catch{report(c,'RELEASE_UNCERTAIN',operation);}
 return value;
}
