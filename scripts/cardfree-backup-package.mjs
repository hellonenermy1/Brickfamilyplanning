// Off-platform Node coordinator primitive. No network, Worker route or live capture.
import {createCipheriv, createDecipheriv, createHash, createPublicKey, randomBytes} from 'node:crypto';

const MAGIC = Buffer.from('BRICKB01');
const HEADER = 36; // magic8 + random nonce12 + GCM tag16
export const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
const MAX_D1_BYTES = 16 * 1024 * 1024;
const MAX_DO_BYTES = 64 * 1024;
const MAX_DEVICES = 1000;
const STATE_KEYS = ['latest','health','networkEvidence','lastSafetyEvent','sequenceHighWater','safetyEvaluationHighWater','safetyHighWater','wsRevoked'];
const hash = value => createHash('sha256').update(value).digest('hex');
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => record(v) && Object.keys(v).sort().join(',') === [...keys].sort().join(',');
const positive = v => Number.isSafeInteger(v) && v > 0;
const decode = bytes => JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
const shaPattern = /^[a-f0-9]{64}$/;

export function backupKey(base64) {
  if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(base64)) throw Error('backup key must be canonical base64 of 32 random bytes');
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32 || key.toString('base64') !== base64) throw Error('invalid backup key');
  return key;
}
function checkContext(context) {
  if (!exact(context, ['deployment','sourceSha','backupId','capturedAt','keyId']) ||
      typeof context.deployment !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(context.deployment) ||
      typeof context.sourceSha !== 'string' || !/^[a-f0-9]{40}$/.test(context.sourceSha) ||
      typeof context.backupId !== 'string' || !/^[a-f0-9]{32}$/.test(context.backupId) ||
      !positive(context.capturedAt) || typeof context.keyId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(context.keyId)) throw Error('invalid backup context');
}
function contextEqual(a,b) { return ['deployment','sourceSha','backupId','capturedAt','keyId'].every(k => a[k] === b[k]); }
function stateSafe(value, depth=0) {
  if (depth > 32) throw Error('backup state nesting limit');
  if (value === null || ['string','boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))) return;
  if (Array.isArray(value)) { for (const v of value) stateSafe(v,depth+1); return; }
  if (record(value)) { for (const v of Object.values(value)) stateSafe(v,depth+1); return; }
  throw Error('invalid backup state');
}
function checkDeviceState(state) {
  if (!record(state)) throw Error('invalid backup device state');
  for (const [key,value] of Object.entries(state)) {
    if (!STATE_KEYS.includes(key)) throw Error('unknown backup device state');
    if (key === 'wsRevoked') { if (typeof value !== 'boolean') throw Error('invalid backup revocation'); }
    else if (key === 'safetyHighWater') { if (!Number.isSafeInteger(value) || value < 0) throw Error('invalid backup marker'); }
    else if (key === 'sequenceHighWater' || key === 'safetyEvaluationHighWater') {
      if (!record(value) || !Number.isSafeInteger(value.epoch) || value.epoch < 0 || !Number.isSafeInteger(value.sequence) || value.sequence < 0) throw Error('invalid backup sequence');
    } else if (!record(value)) throw Error('invalid backup telemetry');
    stateSafe(value);
  }
}
function component(name,bytes) {
  return {name,bytes:bytes.length,sha256:hash(bytes),bodyBase64:bytes.toString('base64')};
}
function unpackComponent(value, limit) {
  if (!exact(value,['name','bytes','sha256','bodyBase64']) || typeof value.name !== 'string' ||
      !positive(value.bytes) || value.bytes > limit || typeof value.sha256 !== 'string' || !shaPattern.test(value.sha256) ||
      typeof value.bodyBase64 !== 'string' || value.bodyBase64.length !== 4 * Math.ceil(value.bytes / 3)) throw Error('invalid backup component');
  const bytes = Buffer.from(value.bodyBase64,'base64');
  if (bytes.length !== value.bytes || bytes.toString('base64') !== value.bodyBase64 || hash(bytes) !== value.sha256) throw Error('backup component integrity mismatch');
  return bytes;
}
function validatePayload(payload,expected) {
  if (!exact(payload,['format','context','components']) || payload.format !== 'brick-protected-recovery-v1') throw Error('invalid protected backup payload');
  checkContext(payload.context);
  if (!contextEqual(payload.context,expected)) throw Error('backup context mismatch');
  if (!Array.isArray(payload.components) || payload.components.length < 1 || payload.components.length > MAX_DEVICES + 1) throw Error('invalid backup inventory');
  const [first,...devices] = payload.components;
  if (first?.name !== 'd1') throw Error('missing backup D1 component');
  const body = unpackComponent(first,MAX_D1_BYTES), d1 = decode(body);
  if (!exact(d1,['format','createdAt','primary','diagnostics']) || d1.format !== 'brick-cardfree-d1-v1' || d1.createdAt !== expected.capturedAt ||
      !record(d1.primary?.tables) || !record(d1.diagnostics?.tables) || !Array.isArray(d1.primary.tables.devices)) throw Error('invalid backup D1 envelope');
  const identities = new Map();
  for (const device of d1.primary.tables.devices) {
    if (!record(device) || typeof device.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(device.id) || identities.has(device.id) || typeof device.public_key_spki_b64 !== 'string') throw Error('invalid backup device inventory');
    const spki = Buffer.from(device.public_key_spki_b64,'base64');
    if (spki.toString('base64') !== device.public_key_spki_b64 || spki.length < 80 || spki.length > 256) throw Error('invalid backup device key');
    let key; try { key=createPublicKey({key:spki,format:'der',type:'spki'}); } catch { throw Error('invalid backup device key'); }
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw Error('invalid backup device curve');
    identities.set(device.id,hash(device.public_key_spki_b64));
  }
  if (identities.size !== devices.length) throw Error('incomplete backup device coverage');
  const seen = new Set(), snapshots = [];
  for (const entry of devices) {
    const bytes=unpackComponent(entry,MAX_DO_BYTES), snapshot=decode(bytes);
    if (!exact(snapshot,['format','deviceId','keySha256','capturedAt','state']) || snapshot.format !== 'brick-do-snapshot-v1' ||
        entry.name !== 'do/'+snapshot.deviceId || !identities.has(snapshot.deviceId) || seen.has(snapshot.deviceId) ||
        snapshot.keySha256 !== identities.get(snapshot.deviceId) || !positive(snapshot.capturedAt)) throw Error('backup device identity mismatch');
    checkDeviceState(snapshot.state);
    seen.add(snapshot.deviceId);
    snapshots.push({id:snapshot.deviceId,serialized:bytes.toString('utf8'),sha256:entry.sha256});
  }
  // Full D1 schema/rows/object hashes and target emptiness are still checked by
  // restoreCardfreeD1; target DO performs its own identity/emptiness checks.
  return {context:{...payload.context},body,sha256:first.sha256,doSnapshots:snapshots};
}

export function sealBackup({context,body,doSnapshots},keyBase64) {
  checkContext(context);
  const key=backupKey(keyBase64);
  try {
    if (!(body instanceof Uint8Array || body instanceof ArrayBuffer) || body.byteLength === 0 || body.byteLength > MAX_D1_BYTES || !Array.isArray(doSnapshots) || doSnapshots.length > MAX_DEVICES) throw Error('backup capture exceeds envelope');
    const components=[component('d1',Buffer.from(body)),...doSnapshots.map(snapshot=>{
      if (!exact(snapshot,['id','serialized','sha256']) || typeof snapshot.serialized !== 'string' || Buffer.byteLength(snapshot.serialized) > MAX_DO_BYTES || hash(snapshot.serialized) !== snapshot.sha256) throw Error('invalid captured device snapshot');
      return component('do/'+snapshot.id,Buffer.from(snapshot.serialized));
    })];
    const payload={format:'brick-protected-recovery-v1',context,components};
    validatePayload(payload,context);
    const plaintext=Buffer.from(JSON.stringify(payload));
    if (plaintext.length + HEADER > MAX_PACKAGE_BYTES) throw Error('protected backup byte limit exceeded');
    const nonce=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,nonce);
    cipher.setAAD(MAGIC);
    try {
      const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
      return Buffer.concat([MAGIC,nonce,cipher.getAuthTag(),ciphertext]);
    } finally { plaintext.fill(0); }
  } finally { key.fill(0); }
}

export function openBackup(bytes,keyBase64,expectedContext) {
  checkContext(expectedContext);
  if (!(bytes instanceof Uint8Array) || bytes.byteLength <= HEADER || bytes.byteLength > MAX_PACKAGE_BYTES) throw Error('protected backup size invalid');
  const input=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if (!input.subarray(0,8).equals(MAGIC)) throw Error('protected backup version invalid');
  const key=backupKey(keyBase64);
  let plaintext;
  try {
    const decipher=createDecipheriv('aes-256-gcm',key,input.subarray(8,20));
    decipher.setAAD(MAGIC);decipher.setAuthTag(input.subarray(20,HEADER));
    // Never parse or return decipher.update() output before tag verification.
    const partial=decipher.update(input.subarray(HEADER));
    try { plaintext=Buffer.concat([partial,decipher.final()]); }
    catch { throw Error('protected backup authentication failed'); }
    finally { partial.fill(0); }
    return validatePayload(decode(plaintext),expectedContext);
  } finally { key.fill(0);plaintext?.fill(0); }
}

// Shared strict context validation for the off-platform capture coordinator.
export {checkContext as validateBackupContext};
