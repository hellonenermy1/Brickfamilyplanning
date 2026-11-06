// Staged Group1 component. Not imported/exported by a production Worker or scheduler.
// A DRAINED result accounts for declared writers only; complete ingress/DO/background
// coverage and an authenticated transport must precede any operational activation.
import type {CaptureFence, HeldCaptureFence} from './cardfree-capture';

type Identity = {sourceSha: string; resourceSetSha256: string};
export type WriterTicket = {authorityEpoch: string; writerId: string; tracked: boolean};
export type ExternalOperation='publication'|'probe'|'schema'|'deployment';
type Writer = {priority: 'ordinary' | 'urgent'; admittedAt: number; externalOperation?:ExternalOperation};
type Capture = CaptureFence & {state: 'DRAINING' | 'DRAINED'; expiresAt: number};
type Closed = {captureId: string; generation: string; reason: 'RELEASED' | 'EXPIRED' | 'PREEMPTED'};
type State = {format: 1; identity: Identity; authorityEpoch: string; lastSeenAt: number; writers: Record<string, Writer>; capture: Capture | null; closed: Closed | null; quarantined: boolean};
const KEY = 'brick-capture-admission-v1';
export const MAX_DECLARED_WRITERS = 128;
const hex = (v: unknown, n: number): v is string => typeof v === 'string' && new RegExp('^[a-f0-9]{'+n+'}$').test(v);
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, keys: string[]) => object(v) && Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const time = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const id = () => crypto.randomUUID().replaceAll('-', '');
const sameIdentity = (a: Identity, b: Identity) => a.sourceSha === b.sourceSha && a.resourceSetSha256 === b.resourceSetSha256;
function identity(v: unknown): asserts v is Identity {if (!exact(v, ['sourceSha','resourceSetSha256']) || !hex((v as Identity).sourceSha,40) || !hex((v as Identity).resourceSetSha256,64)) throw Error('CAPTURE_IDENTITY_INVALID');}
function validState(v: unknown): asserts v is State {
  if (!exact(v,['format','identity','authorityEpoch','lastSeenAt','writers','capture','closed','quarantined'])) throw Error('CAPTURE_AUTHORITY_CORRUPT');
  const s=v as State;
  try {identity(s.identity);} catch {throw Error('CAPTURE_AUTHORITY_CORRUPT');}
  if(s.format!==1||!hex(s.authorityEpoch,32)||!time(s.lastSeenAt)||typeof s.quarantined!=='boolean'||!object(s.writers)||Object.keys(s.writers).length>MAX_DECLARED_WRITERS)throw Error('CAPTURE_AUTHORITY_CORRUPT');
  for(const [key,w] of Object.entries(s.writers))if(!hex(key,32)||!(exact(w,['priority','admittedAt'])||exact(w,['priority','admittedAt','externalOperation'])&&w.priority==='ordinary'&&['publication','probe','schema','deployment'].includes(w.externalOperation!))||!['ordinary','urgent'].includes(w.priority)||!time(w.admittedAt)||w.admittedAt>s.lastSeenAt)throw Error('CAPTURE_AUTHORITY_CORRUPT');
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
      const state:State={format:1,identity:{...expected},authorityEpoch:id(),lastSeenAt:now,writers:{},capture:null,closed:null,quarantined:false};
      await txn.put(KEY,state);return{initialized:true,authorityEpoch:state.authorityEpoch};
    });
  }
  private async change<T>(fn:(s:State,now:number)=>T):Promise<T>{
    return this.storage.transaction(async txn=>{
      const s=await txn.get<State>(KEY);if(s===undefined)throw Error('CAPTURE_AUTHORITY_UNINITIALIZED');validState(s);const now=this.now();
      if(now<s.lastSeenAt)throw Error('CAPTURE_CLOCK_REGRESSED');s.lastSeenAt=now;
      if(s.capture&&s.capture.expiresAt<=now)close(s,'EXPIRED');
      const result=fn(s,now);validState(s);await txn.put(KEY,s);return result;
    });
  }
  async enterWriter(writerId:string,priority:'ordinary'|'urgent'){
    if(!hex(writerId,32)||!['ordinary','urgent'].includes(priority))throw Error('CAPTURE_WRITER_INVALID');
    return this.change((s,now)=>{
      const prior=s.writers[writerId];
      if(prior){if(prior.priority!==priority||prior.externalOperation!==undefined)throw Error('CAPTURE_WRITER_REUSE');return{admitted:true,ticket:{authorityEpoch:s.authorityEpoch,writerId,tracked:true} satisfies WriterTicket};}
      if(priority==='ordinary'&&(s.capture!==null||s.quarantined))return{admitted:false,code:'CAPTURE_BUSY' as const};
      if(priority==='urgent')close(s,'PREEMPTED');
      if(Object.keys(s.writers).length>=MAX_DECLARED_WRITERS){
        if(priority==='ordinary')return{admitted:false,code:'WRITER_CAPACITY' as const};
        // Urgent work is admitted after durable capture quarantine. No later capture
        // can start, even after tracked writers exit; there is deliberately no reset.
        s.quarantined=true;return{admitted:true,ticket:{authorityEpoch:s.authorityEpoch,writerId,tracked:false} satisfies WriterTicket};
      }
      s.writers[writerId]={priority,admittedAt:now};return{admitted:true,ticket:{authorityEpoch:s.authorityEpoch,writerId,tracked:true} satisfies WriterTicket};
    });
  }
  async enterExternalWriter(writerId:string,operation:ExternalOperation,expected:Identity){
    identity(expected);expected={...expected};if(!hex(writerId,32)||!['publication','probe','schema','deployment'].includes(operation))throw Error('CAPTURE_EXTERNAL_WRITER_INVALID');
    return this.change((s,now)=>{
      if(!sameIdentity(s.identity,expected))throw Error('CAPTURE_IDENTITY_MISMATCH');
      const prior=s.writers[writerId];
      if(prior){if(prior.externalOperation!==operation)throw Error('CAPTURE_WRITER_REUSE');return{admitted:true,quarantined:s.quarantined,ticket:{authorityEpoch:s.authorityEpoch,writerId,tracked:true} satisfies WriterTicket};}
      if(s.capture!==null||s.quarantined)return{admitted:false,code:'CAPTURE_BUSY' as const};
      if(Object.keys(s.writers).length>=MAX_DECLARED_WRITERS)return{admitted:false,code:'WRITER_CAPACITY' as const};
      // A schema/deployment transition invalidates the old source/resource proof.
      // Permanent quarantine is committed BEFORE the tool may mutate. Completion,
      // initialize/restart and urgent work cannot silently qualify a new capture.
      if(operation==='schema'||operation==='deployment')s.quarantined=true;
      s.writers[writerId]={priority:'ordinary',admittedAt:now,externalOperation:operation};
      return{admitted:true,quarantined:s.quarantined,ticket:{authorityEpoch:s.authorityEpoch,writerId,tracked:true} satisfies WriterTicket};
    });
  }
  async exitWriter(ticket:WriterTicket){
    if(!exact(ticket,['authorityEpoch','writerId','tracked'])||!hex(ticket.authorityEpoch,32)||!hex(ticket.writerId,32)||typeof ticket.tracked!=='boolean')throw Error('CAPTURE_WRITER_INVALID');
    ticket={...ticket};
    return this.change((s,now)=>{
      if(ticket.authorityEpoch!==s.authorityEpoch)throw Error('CAPTURE_WRITER_EPOCH_MISMATCH');
      if(!ticket.tracked){if(!s.quarantined)throw Error('CAPTURE_WRITER_INVALID');return{released:true,quarantined:true};}
      if(!s.writers[ticket.writerId])return{released:false,code:'WRITER_NOT_TRACKED' as const};
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
