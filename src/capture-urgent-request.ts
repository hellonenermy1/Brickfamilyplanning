// Read-only outage eligibility, never a replacement for normal route validation.
// The body, device signature/lifecycle, immutable UUID identity and rate limiter
// are still checked by the actual handler after the capture guard commits.
import { devParentSessionValid } from './dev-parent-auth';
import { readBoundedBody } from './bounded-body';
import { readVerifiedHealthRequest, validateSafetyReplayWindow } from './device-json-security';
import { validHealth, validSafetyEvent } from './index';
import { localDurabilityEvidenceDenied } from './worker-v5b';
import { verifyDeviceSignature } from './crypto';
import { decodeLivePacket, V1_BYTES, V2_BYTES, type LivePacket } from './protocol';
import { decodeLocationBatchRequest } from './location-ingest-v6';
import { shouldAdvanceLiveState } from './live-state-order';
import { checkSafetyEventIdentity, validSafetyCoordinates } from './safety-event-write';
type Env = { DB: D1Database; BRICK_DEVICE?:{idFromName(name:string):DurableObjectId;get(id:DurableObjectId):{fetch(req:Request):Promise<Response>}}; BETA_STORAGE_MODE?:string; BETA_PARENT_RATE?: { limit(input:{key:string}):Promise<{success:boolean}> }; APP_ENV?:string; DEV_PARENT_AUTH_MODE?:string; DEVICE_RATE?: { limit(input: { key: string }): Promise<{ success: boolean }> } };
const fresh=(at:number,now:number)=>Number.isSafeInteger(at)&&at>=now-120000&&at<=now+120000;
async function ingestAllowed(req:Request,env:Env,id:string,kind:string):Promise<boolean>{
  if(req.method!=='POST'||env.BETA_STORAGE_MODE!=='d1'||!env.DEVICE_RATE)return false;
  const now=Date.now();
  if(kind==='health'){
    if(await localDurabilityEvidenceDenied(req))return false;
    const verified=await readVerifiedHealthRequest(req,env,id,now);
    if(verified instanceof Response||!validHealth(verified.json)||!fresh(verified.sentAt,now))return false;
    new TextDecoder('utf-8',{fatal:true}).decode(verified.body);
    if(Object.values(verified.json).some(v=>typeof v==='number'&&!Number.isFinite(v)))return false;
    const prior=await env.DB.prepare('SELECT last_health_sequence FROM device_replay_state WHERE device_id=?1').bind(id).first<{last_health_sequence:number}>();
    if(prior&&(!Number.isSafeInteger(prior.last_health_sequence)||prior.last_health_sequence<0||verified.sequence<=prior.last_health_sequence))return false;
  }else{
    const signature=req.headers.get('X-Brick-Signature');if(!signature||signature.length>512)return false;
    const device=await env.DB.prepare('SELECT public_key_spki_b64,revoked_at FROM devices WHERE id=?1').bind(id).first<{public_key_spki_b64:string;revoked_at:number|null}>();
    if(!device||device.revoked_at!==null)return false;
    const bounded=await readBoundedBody(req.clone(),kind==='location/batch'?3+20*V2_BYTES:V2_BYTES);
    if(!bounded.ok||!bounded.body.byteLength||!await verifyDeviceSignature(device.public_key_spki_b64,bounded.body,signature))return false;
    let packets:LivePacket[];
    if(kind==='location/batch'){
      const decoded=decodeLocationBatchRequest(bounded.body,now);if(decoded instanceof Response)return false;packets=decoded;
    }else{
      if(![V1_BYTES,V2_BYTES].includes(bounded.body.byteLength))return false;
      const packet=decodeLivePacket(bounded.body);if(kind==='location/live'&&packet.version!==2)return false;packets=[packet];
    }
    if(!packets.every(p=>fresh(p.wallTimeMs,now)))return false;
    if(kind==='location/live'){
      if(!env.BRICK_DEVICE)return false;
      const response=await env.BRICK_DEVICE.get(env.BRICK_DEVICE.idFromName(id)).fetch(new Request('https://internal/state'));
      if(!response.ok)return false;
      const state=await response.json<{latest?:{epoch:number;sequence:number;wallTimeMs:number}|null}>();
      if(!Object.hasOwn(state,'latest'))return false;
      const latest=state.latest;
      if(latest!==null&&(!latest||!Number.isSafeInteger(latest.epoch)||latest.epoch<0||!Number.isSafeInteger(latest.sequence)||latest.sequence<=0||!Number.isSafeInteger(latest.wallTimeMs)||latest.wallTimeMs<=0))return false;
      if(!shouldAdvanceLiveState(packets[0],latest))return false;
    }else{
      // Event receipt alone is NOT full history durability. A failed direct D1
      // history append must retain urgent retry eligibility until holes are filled.
      const clauses=packets.map((_,i)=>'(epoch=?'+(2+i*2)+' AND sequence=?'+(3+i*2)+')').join(' OR ');
      const rows=await env.DB.prepare('SELECT epoch,sequence FROM dev_location_history WHERE device_id=?1 AND ('+clauses+')').bind(id,...packets.flatMap(p=>[p.epoch,p.sequence])).all<{epoch:number;sequence:number}>();
      if(!Array.isArray(rows.results)||rows.results.some(r=>!Number.isSafeInteger(r.epoch)||r.epoch<0||!Number.isSafeInteger(r.sequence)||r.sequence<=0))return false;
      const present=new Set(rows.results.map(r=>r.epoch+':'+r.sequence));
      if(packets.every(p=>present.has(p.epoch+':'+p.sequence)))return false;
    }
  }
  return(await env.DEVICE_RATE.limit({key:id+':capture-ingest'})).success===true;
}
export async function captureUrgentRequestAllowed(req: Request, env: Env): Promise<boolean> {
  try {
    const u=new URL(req.url);
    const ingest=u.pathname.match(/^\/api\/device\/([A-Za-z0-9_-]{1,128})\/(health|location(?:\/batch|\/live)?)$/);
    if(ingest)return await ingestAllowed(req,env,ingest[1],ingest[2]);
    const revoke=u.pathname.match(/^\/parent\/api\/device\/([A-Za-z0-9_-]{1,128})\/revoke$/);
    if(revoke){
      // Server-side session lookup only; never trust the client internal header.
      if(req.method!=='POST'||req.headers.get('Origin')!==u.origin||env.APP_ENV!=='development'||env.DEV_PARENT_AUTH_MODE!=='d1-session-v1')return false;
      const bounded=await readBoundedBody(req.clone(),4096);if(!bounded.ok)return false;
      if(!await devParentSessionValid(req,{DB:env.DB}))return false;
      const target=await env.DB.prepare('SELECT id FROM devices WHERE id=?1').bind(revoke[1]).first();
      if(!target||!env.BETA_PARENT_RATE||typeof env.BETA_PARENT_RATE.limit!=='function')return false;
      return (await env.BETA_PARENT_RATE.limit({key:'capture-revoke:'+(req.headers.get('CF-Connecting-IP')??'unknown').slice(0,96)})).success===true;
    }
    const match = u.pathname.match(/^\/api\/device\/([A-Za-z0-9_-]{1,128})\/event$/);
    if (req.method !== 'POST' || !match) return false;
    const deviceId = match[1];
    const bounded = await readBoundedBody(req.clone(), 8192);
    if (!bounded.ok || !bounded.body.byteLength) return false;
    const event: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bounded.body));
    if (!validSafetyEvent(event) || !validSafetyCoordinates(event) || !['sos_started', 'sos_cancelled'].includes(event.kind)) return false;
    const detailJson = JSON.stringify(event.detail ?? {});
    // Normal signed outbox retries retain the existing 30-day route window.
    // Only a fresh, as-yet unaccepted manual SOS may permanently poison capture.
    const now = Date.now();
    if (detailJson.length > 4096 || !Number.isSafeInteger(event.createdAtMs) || event.createdAtMs < now - 120000 || event.createdAtMs > now + 120000) return false;
    const active = await env.DB.prepare('SELECT id FROM devices WHERE id=?1 AND revoked_at IS NULL').bind(deviceId).first();
    if (!active || await validateSafetyReplayWindow(req, env, deviceId)) return false;
    const identity = await checkSafetyEventIdentity(env.DB, { id: event.eventId, deviceId, kind: event.kind, deviceCreatedAt: event.createdAtMs, serverCreatedAt: now, latitude: event.latitude ?? null, longitude: event.longitude ?? null, accuracyM: event.accuracyM ?? null, detailJson });
    if (identity !== 'absent' || !env.DEVICE_RATE || typeof env.DEVICE_RATE.limit !== 'function') return false;
    return (await env.DEVICE_RATE.limit({ key: deviceId + ':capture-urgent' })).success === true;
  } catch { return false; }
}
