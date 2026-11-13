// Pure Ed25519 receipt verification. No signer/private key, network, recipient,
// default trust root, source writer or notification transport is installed here.
import {createHash,createPublicKey,verify} from 'node:crypto';
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const hex=(v,n)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const fail=()=>{throw Error('BACKUP_ALERT_RECEIPT_UNVERIFIED');};
const hash=v=>createHash('sha256').update(v).digest('hex');
const DOMAIN='BRICK-BACKUP-ALERT-DELIVERED-V1\n';
const FIELDS=['format','monitorId','configSha256','authorityEpoch','recipientSha256','eventId','messageSha256','deliveredAt','issuedAt','expiresAt'];
function base64(value,length){if(typeof value!=='string'||value.length!==4*Math.ceil(length/3)||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))fail();const bytes=Buffer.from(value,'base64');if(bytes.length!==length||bytes.toString('base64')!==value)fail();return bytes;}
export function validateBackupAlertReceiptPin(p){
 try{if(!exact(p,['format','authorityEpoch','recipientSha256','publicKeySpkiBase64'])||p.format!=='brick-backup-alert-pin-v1'||!hex(p.authorityEpoch,32)||!hex(p.recipientSha256,64))fail();const der=base64(p.publicKeySpkiBase64,44),key=createPublicKey({key:der,format:'der',type:'spki'});if(key.asymmetricKeyType!=='ed25519'||!key.export({format:'der',type:'spki'}).equals(der))fail();return Object.freeze(Object.fromEntries(['format','authorityEpoch','recipientSha256','publicKeySpkiBase64'].map(k=>[k,p[k]])));}catch{fail();}
}
export function backupMonitorAlertDigest(message){
 const fields=['format','eventId','monitorId','incidentId','kind','observedAt','capturedAt','code'];
 if(!exact(message,fields)||message.format!=='brick-backup-monitor-alert-v1'||!hex(message.eventId,32)||!hex(message.monitorId,32)||!hex(message.incidentId,32)||!['BACKUP_UNVERIFIED','BACKUP_STALE','BACKUP_RECOVERED'].includes(message.kind)||!positive(message.observedAt)||!positive(message.capturedAt)||typeof message.code!=='string'||!/^[A-Z_]{3,80}$/.test(message.code))fail();
 return hash(JSON.stringify(Object.fromEntries(fields.map(k=>[k,message[k]]))));
}
export function backupAlertReceiptSigningBytes(p){
 if(!exact(p,FIELDS)||p.format!=='brick-backup-alert-delivered-v1'||!hex(p.monitorId,32)||!hex(p.configSha256,64)||!hex(p.authorityEpoch,32)||!hex(p.recipientSha256,64)||!hex(p.eventId,32)||!hex(p.messageSha256,64)||!positive(p.deliveredAt)||!positive(p.issuedAt)||!positive(p.expiresAt)||p.deliveredAt>p.issuedAt||p.expiresAt<=p.issuedAt||p.expiresAt-p.issuedAt>86400000)fail();
 return Buffer.from(DOMAIN+JSON.stringify(Object.fromEntries(FIELDS.map(k=>[k,p[k]]))),'utf8');
}
export function verifyBackupAlertDeliveredReceipt(envelope,pinInput,expected){
 try{
  const pin=validateBackupAlertReceiptPin(pinInput);
  if(!exact(envelope,['payload','signature'])||!exact(expected,['monitorId','configSha256','eventId','messageSha256','observedAt','now'])||!positive(expected.now)||!positive(expected.observedAt))fail();
  const bytes=backupAlertReceiptSigningBytes(envelope.payload),signature=base64(envelope.signature,64),p=envelope.payload;
  if(p.monitorId!==expected.monitorId||p.configSha256!==expected.configSha256||p.eventId!==expected.eventId||p.messageSha256!==expected.messageSha256||p.authorityEpoch!==pin.authorityEpoch||p.recipientSha256!==pin.recipientSha256||p.deliveredAt<expected.observedAt||p.issuedAt>expected.now||p.expiresAt<=expected.now)fail();
  const publicKey=createPublicKey({key:base64(pin.publicKeySpkiBase64,44),format:'der',type:'spki'});
  if(!verify(null,bytes,publicKey,signature))fail();
  const canonical={payload:Object.fromEntries(FIELDS.map(k=>[k,p[k]])),signature:signature.toString('base64')};
  return{envelope:canonical,sha256:hash(JSON.stringify(canonical)),verifiedAt:expected.now};
 }catch{fail();}
}
