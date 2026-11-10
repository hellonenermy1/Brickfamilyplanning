// Staged Group1 component. Not imported/exported by a production Worker or scheduler.
// A DRAINED result accounts for declared writers only; complete ingress/DO/background
// coverage and an authenticated transport must precede any operational activation.
import type {CaptureFence, HeldCaptureFence} from './cardfree-capture';

type Identity = {sourceSha: string; resourceSetSha256: string};
export type WriterTicket = {authorityEpoch: string; writerId: string; tracked: boolean};
export type ExternalOperation='publication'|'probe'|'schema'|'deployment';
export type ReservationKind={kind:'runtime';priority:'ordinary'|'urgent'}|{kind:'external';operation:ExternalOperation};
export type ReservationCancellation=ReservationKind&{authorityEpoch:string;writerId:string};
export type WriterPrincipal={role:'runtime'|'external';keyId:string;keySha256:string};
type OwnedKind=ReservationKind&{principal?:WriterPrincipal};
type Writer = {principal?:WriterPrincipal;priority: 'ordinary' | 'urgent'; admittedAt: number; externalOperation?:ExternalOperation;phase?:'RESERVED'|'STARTED';parentWriterId?:string};
type Capture = CaptureFence & {state: 'DRAINING' | 'DRAINED'; expiresAt: number};
type Closed = {captureId: string; generation: string; reason: 'RELEASED' | 'EXPIRED' | 'PREEMPTED'};
type State = {format: 1|2|3; identity: Identity; authorityEpoch: string; lastSeenAt: number; writers: Record<string, Writer>; capture: Capture | null; closed: Closed | null; quarantined: boolean;cancelled?:Record<string,OwnedKind>};
const KEY = 'brick-capture-admission-v1';
export const MAX_DECLARED_WRITERS = 128;
export const MAX_CANCELLED_RESERVATIONS=128;
const hex = (v: unknown, n: number): v is string => typeof v === 'string' && new RegExp('^[a-f0-9]{'+n+'}$').test(v);
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, keys: string[]) => object(v) && Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const time = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const id = () => crypto.randomUUID().replaceAll('-', '');
const sameIdentity = (a: Identity, b: Identity) => a.sourceSha === b.sourceSha && a.resourceSetSha256 === b.resourceSetSha256;
function identity(v: unknown): asserts v is Identity {if (!exact(v, ['sourceSha','resourceSetSha256']) || !hex((v as Identity).sourceSha,40) || !hex((v as Identity).resourceSetSha256,64)) throw Error('CAPTURE_IDENTITY_INVALID');}
function kind(v:unknown):v is ReservationKind{return object(v)&&(exact(v,['kind','priority'])&&v.kind==='runtime'&&['ordinary','urgent'].includes(v.priority as string)||exact(v,['kind','operation'])&&v.kind==='external'&&['publication','probe','schema','deployment'].includes(v.operation as string));}
const writerKind=(w:Writer):ReservationKind=>w.externalOperation===undefined?{kind:'runtime',priority:w.priority}:{kind:'external',operation:w.externalOperation};
const sameKind=(a:ReservationKind,b:ReservationKind)=>a.kind===b.kind&&(a.kind==='runtime'&&b.kind==='runtime'?a.priority===b.priority:a.kind==='external'&&b.kind==='external'&&a.operation===b.operation);
function validPrincipal(v:unknown):v is WriterPrincipal{return exact(v,['role','keyId','keySha256'])&&object(v)&&['runtime','external'].includes(v.role as string)&&typeof v.keyId==='string'&&/^[A-Za-z0-9_-]{1,48}$/.test(v.keyId)&&hex(v.keySha256,64);}
function samePrincipal(a:WriterPrincipal|undefined,b:WriterPrincipal|undefined){return a===undefined&&b===undefined||a!==undefined&&b!==undefined&&a.role===b.role&&a.keyId===b.keyId&&a.keySha256===b.keySha256;}
function checkPrincipal(a:WriterPrincipal|undefined,b:WriterPrincipal|undefined){if(!samePrincipal(a,b))throw Error('CAPTURE_WRITER_PRINCIPAL_MISMATCH');}
function ownedKind(v:unknown,format:number):v is OwnedKind{if(!object(v))return false;const {principal,...descriptor}=v;return kind(descriptor)&&(principal===undefined?!Object.hasOwn(v,'principal'):format===3&&validPrincipal(principal)&&principal.role===descriptor.kind);}
function validState(v: unknown): asserts v is State {
  if (!(exact(v,['format','identity','authorityEpoch','lastSeenAt','writers','capture','closed','quarantined'])||exact(v,['format','identity','authorityEpoch','lastSeenAt','writers','capture','closed','quarantined','cancelled']))) throw Error('CAPTURE_AUTHORITY_CORRUPT');
  const s=v as State;
  try {identity(s.identity);} catch {throw Error('CAPTURE_AUTHORITY_CORRUPT');}
  if(![1,2,3].includes(s.format)||s.format===1&&Object.hasOwn(s,'cancelled')||s.format!==1&&!object(s.cancelled)||!hex(s.authorityEpoch,32)||!time(s.lastSeenAt)||typeof s.quarantined!=='boolean'||!object(s.writers)||Object.keys(s.writers).length>MAX_DECLARED_WRITERS)throw Error('CAPTURE_AUTHORITY_CORRUPT');
  for(const [key,w] of Object.entries(s.writers)){if(!object(w))throw Error('CAPTURE_AUTHORITY_CORRUPT');const fields=[...(w.principal===undefined?[]:['principal']),'priority','admittedAt',...(w.externalOperation===undefined?[]:['externalOperation']),...(w.phase===undefined?[]:['phase']),...(w.parentWriterId===undefined?[]:['parentWriterId'])];if(!hex(key,32)||!exact(w,fields)||w.principal!==undefined&&(s.format!==3||!validPrincipal(w.principal)||w.principal.role!==writerKind(w).kind)||w.parentWriterId!==undefined&&(!hex(w.parentWriterId,32)||w.parentWriterId===key||w.priority!=='ordinary'||w.externalOperation!==undefined||w.phase===undefined)||w.externalOperation!==undefined&&(w.priority!=='ordinary'||!['publication','probe','schema','deployment'].includes(w.externalOperation))||w.phase!==undefined&&(s.format===1||!['RESERVED','STARTED'].includes(w.phase))||!['ordinary','urgent'].includes(w.priority)||!time(w.admittedAt)||w.admittedAt>s.lastSeenAt)throw Error('CAPTURE_AUTHORITY_CORRUPT');}
  if(s.cancelled!==undefined&&(!object(s.cancelled)||Object.keys(s.cancelled).length>MAX_CANCELLED_RESERVATIONS||Object.entries(s.cancelled).some(([key,value])=>!hex(key,32)||!ownedKind(value,s.format)||Object.hasOwn(s.writers,key))))throw Error('CAPTURE_AUTHORITY_CORRUPT');
  if(s.closed!==null&&(!exact(s.closed,['captureId','generation','reason'])||!hex(s.closed.captureId,32)||!hex(s.closed.generation,32)||!['RELEASED','EXPIRED','PREEMPTED'].includes(s.closed.reason)))throw Error('CAPTURE_AUTHORITY_CORRUPT');
  if(s.capture!==null){const c=s.capture;if(!exact(c,['captureId','generation','resourceSetSha256','sourceSha','pausedAt','state','expiresAt'])||!hex(c.captureId,32)||!hex(c.generation,32)||!sameIdentity(c,s.identity)||!time(c.pausedAt)||!time(c.expiresAt)||c.expiresAt<=c.pausedAt||c.expiresAt>c.pausedAt+300000||c.pausedAt>s.lastSeenAt||!['DRAINING','DRAINED'].includes(c.state)||s.quarantined||c.state==='DRAINED'&&Object.keys(s.writers).length!==0)throw Error('CAPTURE_AUTHORITY_CORRUPT');}
}
function matches(c: Capture, pin: CaptureFence){return ['captureId','generation','resourceSetSha256','sourceSha','pausedAt'].every(k=>c[k as keyof CaptureFence]===pin[k as keyof CaptureFence]);}
function checkPin(pin: CaptureFence){if(!exact(pin,['captureId','generation','resourceSetSha256','sourceSha','pausedAt'])||!hex(pin.captureId,32)||!hex(pin.generation,32)||!hex(pin.resourceSetSha256,64)||!hex(pin.sourceSha,40)||!time(pin.pausedAt))throw Error('CAPTURE_PIN_INVALID');}
function close(s: State, reason: Closed['reason']) {if(s.capture){s.closed={captureId:s.capture.captureId,generation:s.capture.generation,reason};s.capture=null;}}
function held(c: Capture, count: number){return {...c,activeWriters:count};}

export class CaptureAdmissionStore {
  constructor(private readonly storage: Pick<DurableObjectStorage,'transaction'>, private readonly clock: ()=>number = Date.now) {}
  private now(){const now=this.clock();if(!time(now))throw Error('CAPTURE_CLOCK_INVALID');return now;}
  async initialize(expected: Identity) {
    identity(expected);expected={...expected};
    return this.storage.transaction(async txn=>{
      const prior=await txn.get<State>(KEY);
      if(prior!==undefined){validState(prior);if(!sameIdentity(prior.identity,expected))throw Error('CAPTURE_IDENTITY_MISMATCH');return{initialized:true,authorityEpoch:prior.authorityEpoch};}
      const now=this.now();
      const state:State={format:3,identity:{...expected},authorityEpoch:id(),lastSeenAt:now,writers:{},capture:null,closed:null,quarantined:false,cancelled:{}};
      await txn.put(KEY,state);return{initialized:true,authorityEpoch:state.authorityEpoch};
    });
  }
  private async change<T>(fn:(s:State,now:number)=>T):Promise<T>{
    return this.storage.transaction(async txn=>{
      const s=await txn.get<State>(KEY);if(s===undefined)throw Error('CAPTURE_AUTHORITY_UNINITIALIZED');validState(s);const now=this.now();
      if(now<s.lastSeenAt)throw Error('CAPTURE_CLOCK_REGRESSED');s.lastSeenAt=now;if(s.format===1)s.cancelled={};s.format=3;
      if(s.capture&&s.capture.expiresAt<=now)close(s,'EXPIRED');
      const result=fn(s,now);validState(s);await txn.put(KEY,s);return result;
    });
  }
  // Trusted broker capability; principal comes ONLY from its verified key table.
  // No caller payload or serialized ticket may choose it. All state comparisons
  // and mutation occur inside the same durable transaction below.
  async writerCommandForPrincipal(operation:string,payload:Record<string,unknown>,principal:WriterPrincipal){
    if(!validPrincipal(principal)||!object(payload))throw Error('CAPTURE_WRITER_PRINCIPAL_INVALID');principal={...principal};
    if(operation.startsWith('runtime.')&&principal.role!=='runtime'||operation.startsWith('external.')&&principal.role!=='external')throw Error('CAPTURE_WRITER_PRINCIPAL_MISMATCH');
    switch(operation){
      case'runtime.enter':return this.admitWriter(payload.writerId as string,payload.priority as 'ordinary'|'urgent',true,principal);
      case'runtime.descendant':return this.admitDescendant(payload.writerId as string,payload.parent as WriterTicket,principal);
      case'external.enter':return this.admitExternal(payload.writerId as string,payload.operation as ExternalOperation,payload.identity as Identity,true,principal);
      case'runtime.start':return this.startOwnedWriter(payload.ticket as WriterTicket,{kind:'runtime',priority:payload.priority as 'ordinary'},principal);
      case'external.start':return this.startOwnedWriter(payload.ticket as WriterTicket,{kind:'external',operation:payload.operation as ExternalOperation},principal);
      case'runtime.cancel':return this.cancelOwnedReservation({authorityEpoch:payload.authorityEpoch as string,writerId:payload.writerId as string,kind:'runtime',priority:payload.priority as 'ordinary'},principal);
      case'external.cancel':return this.cancelOwnedReservation({authorityEpoch:payload.authorityEpoch as string,writerId:payload.writerId as string,kind:'external',operation:payload.operation as ExternalOperation},principal);
      case'writer.exit':return this.finishWriter(payload as WriterTicket,principal.role,principal);
      default:throw Error('CAPTURE_WRITER_OPERATION_INVALID');
    }
  }
  async enterWriter(writerId:string,priority:'ordinary'|'urgent'){
    return this.admitWriter(writerId,priority,false);
  }
  async reserveWriter(writerId:string,priority:'ordinary'|'urgent'){
    return this.admitWriter(writerId,priority,true);
  }
  private async admitWriter(writerId:string,priority:'ordinary'|'urgent',reserved:boolean,principal?:WriterPrincipal){
    if(!hex(writerId,32)||!['ordinary','urgent'].includes(priority))throw Error('CAPTURE_WRITER_INVALID');
    return this.change((s,now)=>{
      if(s.cancelled?.[writerId]){checkPrincipal(s.cancelled[writerId].principal,principal);if(!sameKind(s.cancelled[writerId],{kind:'runtime',priority}))throw Error('CAPTURE_WRITER_REUSE');return{admitted:false,code:'WRITER_CANCELLED' as const};}
      const prior=s.writers[writerId];
      if(prior){checkPrincipal(prior.principal,principal);if(prior.parentWriterId!==undefined||prior.priority!==priority||prior.externalOperation!==undefined||(prior.phase!==undefined)!==reserved)throw Error('CAPTURE_WRITER_REUSE');return{admitted:true,...(reserved?{requiresStart:true}:{}),ticket:{authorityEpoch:s.authorityEpoch,writerId,tracked:true} satisfies WriterTicket};}
      if(priority==='ordinary'&&(s.capture!==null||s.quarantined))return{admitted:false,code:'CAPTURE_BUSY' as const};
      if(priority==='urgent')close(s,'PREEMPTED');
      if(Object.keys(s.writers).length>=MAX_DECLARED_WRITERS){
        if(priority==='ordinary')return{admitted:false,code:'WRITER_CAPACITY' as const};
        // Urgent work is admitted after durable capture quarantine. No later capture
        // can start, even after tracked writers exit; there is deliberately no reset.
        s.quarantined=true;return{admitted:true,...(reserved?{requiresStart:true}:{}),ticket:{authorityEpoch:s.authorityEpoch,writerId,tracked:false} satisfies WriterTicket};
      }
      s.writers[writerId]={...(principal?{principal}:{}),priority,admittedAt:now,...(reserved?{phase:'RESERVED' as const}:{})};return{admitted:true,...(reserved?{requiresStart:true}:{}),ticket:{authorityEpoch:s.authorityEpoch,writerId,tracked:true} satisfies WriterTicket};
    });
  }
  // Authenticated runtime transport only. Each child remains independently owned.
  // A live STARTED parent permits continuation while capture is DRAINING, never
  // after parent release, from RESERVED/legacy/external work, or in quarantine.
  async reserveDescendantWriter(writerId:string,parent:WriterTicket){return this.admitDescendant(writerId,parent);}
  private async admitDescendant(writerId:string,parent:WriterTicket,principal?:WriterPrincipal){
    if(!hex(writerId,32)||!exact(parent,['authorityEpoch','writerId','tracked'])||!hex(parent.authorityEpoch,32)||!hex(parent.writerId,32)||parent.tracked!==true||writerId===parent.writerId)throw Error('CAPTURE_DESCENDANT_INVALID');parent={...parent};
    return this.change((s,now)=>{
      if(parent.authorityEpoch!==s.authorityEpoch)throw Error('CAPTURE_WRITER_EPOCH_MISMATCH');
      const cancelled=s.cancelled?.[writerId];if(cancelled){checkPrincipal(cancelled.principal,principal);if(!sameKind(cancelled,{kind:'runtime',priority:'ordinary'}))throw Error('CAPTURE_WRITER_REUSE');return{admitted:false,code:'WRITER_CANCELLED' as const};}
      const prior=s.writers[writerId];
      if(prior){checkPrincipal(prior.principal,principal);if(prior.parentWriterId!==parent.writerId)throw Error('CAPTURE_WRITER_REUSE');return{admitted:true,requiresStart:true,ticket:{authorityEpoch:s.authorityEpoch,writerId,tracked:true} satisfies WriterTicket};}
      const owner=s.writers[parent.writerId];
      if(s.quarantined||!owner||owner.phase!=='STARTED'||owner.externalOperation!==undefined||s.capture?.state==='DRAINED')return{admitted:false,code:'PARENT_UNAVAILABLE' as const};
      if(Object.keys(s.writers).length>=MAX_DECLARED_WRITERS)return{admitted:false,code:'WRITER_CAPACITY' as const};
      s.writers[writerId]={...(principal?{principal}:{}),priority:'ordinary',admittedAt:now,phase:'RESERVED',parentWriterId:parent.writerId};
      return{admitted:true,requiresStart:true,ticket:{authorityEpoch:s.authorityEpoch,writerId,tracked:true} satisfies WriterTicket};
    });
  }
  async enterExternalWriter(writerId:string,operation:ExternalOperation,expected:Identity){
    return this.admitExternal(writerId,operation,expected,false);
  }
  async reserveExternalWriter(writerId:string,operation:ExternalOperation,expected:Identity){
    return this.admitExternal(writerId,operation,expected,true);
  }
  private async admitExternal(writerId:string,operation:ExternalOperation,expected:Identity,reserved:boolean,principal?:WriterPrincipal){
    identity(expected);expected={...expected};if(!hex(writerId,32)||!['publication','probe','schema','deployment'].includes(operation))throw Error('CAPTURE_EXTERNAL_WRITER_INVALID');
    return this.change((s,now)=>{
      if(!sameIdentity(s.identity,expected))throw Error('CAPTURE_IDENTITY_MISMATCH');
      if(s.cancelled?.[writerId]){checkPrincipal(s.cancelled[writerId].principal,principal);if(!sameKind(s.cancelled[writerId],{kind:'external',operation}))throw Error('CAPTURE_WRITER_REUSE');return{admitted:false,code:'WRITER_CANCELLED' as const};}
      const prior=s.writers[writerId];
      if(prior){checkPrincipal(prior.principal,principal);if(prior.externalOperation!==operation||(prior.phase!==undefined)!==reserved)throw Error('CAPTURE_WRITER_REUSE');return{admitted:true,...(reserved?{requiresStart:true}:{}),quarantined:s.quarantined,ticket:{authorityEpoch:s.authorityEpoch,writerId,tracked:true} satisfies WriterTicket};}
      if(s.capture!==null||s.quarantined)return{admitted:false,code:'CAPTURE_BUSY' as const};
      if(Object.keys(s.writers).length>=MAX_DECLARED_WRITERS)return{admitted:false,code:'WRITER_CAPACITY' as const};
      // A schema/deployment transition invalidates the old source/resource proof.
      // Permanent quarantine is committed BEFORE the tool may mutate. Completion,
      // initialize/restart and urgent work cannot silently qualify a new capture.
      if(operation==='schema'||operation==='deployment')s.quarantined=true;
      s.writers[writerId]={...(principal?{principal}:{}),priority:'ordinary',admittedAt:now,externalOperation:operation,...(reserved?{phase:'RESERVED' as const}:{})};
      return{admitted:true,...(reserved?{requiresStart:true}:{}),quarantined:s.quarantined,ticket:{authorityEpoch:s.authorityEpoch,writerId,tracked:true} satisfies WriterTicket};
    });
  }
  async startWriter(ticket:WriterTicket,expectedKind:ReservationKind){return this.startOwnedWriter(ticket,expectedKind);}
  private async startOwnedWriter(ticket:WriterTicket,expectedKind:ReservationKind,principal?:WriterPrincipal){
    if(!exact(ticket,['authorityEpoch','writerId','tracked'])||!hex(ticket.authorityEpoch,32)||!hex(ticket.writerId,32)||typeof ticket.tracked!=='boolean'||!kind(expectedKind))throw Error('CAPTURE_RESERVATION_INVALID');ticket={...ticket};expectedKind={...expectedKind};
    return this.change(s=>{if(ticket.authorityEpoch!==s.authorityEpoch)throw Error('CAPTURE_WRITER_EPOCH_MISMATCH');if(!ticket.tracked){if(!s.quarantined||s.writers[ticket.writerId]||s.cancelled?.[ticket.writerId]||expectedKind.kind!=='runtime'||expectedKind.priority!=='urgent')throw Error('CAPTURE_RESERVATION_INVALID');return{started:true,authorityEpoch:s.authorityEpoch,writerId:ticket.writerId};}const w=s.writers[ticket.writerId];if(!w||w.phase===undefined||!sameKind(writerKind(w),expectedKind))throw Error('CAPTURE_RESERVATION_UNAVAILABLE');checkPrincipal(w.principal,principal);w.phase='STARTED';return{started:true,authorityEpoch:s.authorityEpoch,writerId:ticket.writerId};});
  }
  async cancelReservation(request:ReservationCancellation){return this.cancelOwnedReservation(request);}
  private async cancelOwnedReservation(request:ReservationCancellation,principal?:WriterPrincipal){
    if(!object(request)||!hex(request.authorityEpoch,32)||!hex(request.writerId,32))throw Error('CAPTURE_RESERVATION_INVALID');const descriptor:unknown=request.kind==='runtime'?{kind:request.kind,priority:request.priority}:{kind:request.kind,operation:request.operation};if(!kind(descriptor)||!exact(request,['authorityEpoch','writerId',...Object.keys(descriptor)]))throw Error('CAPTURE_RESERVATION_INVALID');const epoch=request.authorityEpoch,writerId=request.writerId,expected={...descriptor};
    return this.change((s,now)=>{if(epoch!==s.authorityEpoch)throw Error('CAPTURE_WRITER_EPOCH_MISMATCH');const cancelled=s.cancelled??{},prior=cancelled[writerId];if(prior){checkPrincipal(prior.principal,principal);if(!sameKind(prior,expected))throw Error('CAPTURE_WRITER_REUSE');return{cancelled:true};}const w=s.writers[writerId];if(w)checkPrincipal(w.principal,principal);if(w&&(!sameKind(writerKind(w),expected)||w.phase!=='RESERVED'))return{cancelled:false,code:'NOT_UNSTARTED' as const};if(!w&&s.quarantined)return{cancelled:false,code:'QUARANTINED_UNKNOWN' as const};if(Object.keys(cancelled).length>=MAX_CANCELLED_RESERVATIONS){close(s,'PREEMPTED');s.quarantined=true;return{cancelled:false,code:'CANCELLATION_CAPACITY' as const};}cancelled[writerId]={...expected,...(principal?{principal}:{})};s.cancelled=cancelled;delete s.writers[writerId];if(s.capture?.state==='DRAINING'&&Object.keys(s.writers).length===0){s.capture.state='DRAINED';s.capture.pausedAt=now;}return{cancelled:true};});
  }
  // Raw trusted fixture capability. Operational signed transport must use the
  // role-bound method below; legacy/unknown work needs separate reconciliation.
  async exitWriter(ticket:WriterTicket){return this.finishWriter(ticket);}
  async exitWriterForRole(ticket:WriterTicket,role:'runtime'|'external'){
    if(!['runtime','external'].includes(role))throw Error('CAPTURE_WRITER_ROLE_MISMATCH');
    return this.finishWriter(ticket,role);
  }
  private async finishWriter(ticket:WriterTicket,role?:'runtime'|'external',principal?:WriterPrincipal){
    if(!exact(ticket,['authorityEpoch','writerId','tracked'])||!hex(ticket.authorityEpoch,32)||!hex(ticket.writerId,32)||typeof ticket.tracked!=='boolean')throw Error('CAPTURE_WRITER_INVALID');
    ticket={...ticket};
    return this.change((s,now)=>{
      if(ticket.authorityEpoch!==s.authorityEpoch)throw Error('CAPTURE_WRITER_EPOCH_MISMATCH');
      if(!ticket.tracked){if(!s.quarantined||role==='external'||role!==undefined&&(s.writers[ticket.writerId]||s.cancelled?.[ticket.writerId]))throw Error('CAPTURE_WRITER_INVALID');return{released:true,quarantined:true};}
      if(!s.writers[ticket.writerId])return{released:false,code:'WRITER_NOT_TRACKED' as const};
      if(s.writers[ticket.writerId].phase==='RESERVED')throw Error('CAPTURE_RESERVATION_NOT_STARTED');
      if(role&&(writerKind(s.writers[ticket.writerId]).kind!==role||s.writers[ticket.writerId].phase!=='STARTED'))throw Error('CAPTURE_WRITER_ROLE_MISMATCH');
      checkPrincipal(s.writers[ticket.writerId].principal,principal);
      delete s.writers[ticket.writerId];
      if(s.capture?.state==='DRAINING'&&Object.keys(s.writers).length===0){s.capture.state='DRAINED';s.capture.pausedAt=now;}
      return{released:true,quarantined:s.quarantined};
    });
  }
  async requestCapture(captureId:string,expected:Identity,leaseMs=300000){
    identity(expected);expected={...expected};if(!hex(captureId,32)||!Number.isSafeInteger(leaseMs)||leaseMs<5||leaseMs>300000)throw Error('CAPTURE_REQUEST_INVALID');
    return this.change((s,now)=>{
      if(!sameIdentity(s.identity,expected))throw Error('CAPTURE_IDENTITY_MISMATCH');
      if(s.quarantined)throw Error('CAPTURE_AUTHORITY_QUARANTINED');
      if(s.capture){if(s.capture.captureId!==captureId)throw Error('CAPTURE_BUSY');return held(s.capture,Object.keys(s.writers).length);}
      // Reusing the most recently closed capture identity must not resurrect it.
      if(s.closed?.captureId===captureId)throw Error('CAPTURE_ID_REUSE');
      s.capture={...s.identity,captureId,generation:id(),pausedAt:now,expiresAt:now+leaseMs,state:Object.keys(s.writers).length?'DRAINING':'DRAINED'};
      return held(s.capture,Object.keys(s.writers).length);
    });
  }
  async pollCapture(captureId:string){if(!hex(captureId,32))throw Error('CAPTURE_REQUEST_INVALID');return this.change(s=>{if(!s.capture||s.capture.captureId!==captureId)throw Error('CAPTURE_UNAVAILABLE');return held(s.capture,Object.keys(s.writers).length);});}
  async assertHeld(pin:CaptureFence):Promise<HeldCaptureFence>{
    checkPin(pin);pin={...pin};return this.change(s=>{if(s.quarantined||!s.capture||!matches(s.capture,pin)||s.capture.state!=='DRAINED'||Object.keys(s.writers).length)throw Error('CAPTURE_UNAVAILABLE');return{...s.capture,state:'DRAINED' as const,activeWriters:0 as const};});
  }
  async release(pin:CaptureFence){
    checkPin(pin);pin={...pin};return this.change(s=>{
      if(s.capture&&matches(s.capture,pin)){close(s,'RELEASED');return{released:true,generation:pin.generation};}
      // Only a valid prior release is idempotent success. PREEMPTED/EXPIRED
      // closure is cleanup, not a valid seal boundary: the coordinator treats
      // released=true as successful capture completion after its final held-check.
      return{released:s.closed?.reason==='RELEASED'&&s.closed.captureId===pin.captureId&&s.closed.generation===pin.generation,generation:pin.generation};
    });
  }
  async status(){return this.change(s=>({state:s.quarantined?'QUARANTINED':s.capture?.state??'OPEN',activeWriters:Object.keys(s.writers).length,authorityEpoch:s.authorityEpoch,capture:s.capture?held(s.capture,Object.keys(s.writers).length):null}));}
}
