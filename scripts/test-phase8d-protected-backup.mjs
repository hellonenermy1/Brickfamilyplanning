import assert from 'node:assert/strict';
import {createCipheriv,createDecipheriv,createHash,generateKeyPairSync,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {backupKey,sealBackup,openBackup,MAX_PACKAGE_BYTES} from './cardfree-backup-package.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const key=randomBytes(32).toString('base64'),wrong=randomBytes(32).toString('base64');
const spki=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'der',type:'spki'}).toString('base64');
const context={deployment:'synthetic-audit',sourceSha:'a'.repeat(40),backupId:'b'.repeat(32),capturedAt:Date.now(),keyId:'ephemeral-test'};
const device={id:'device-a',public_key_spki_b64:spki};
const serialized=JSON.stringify({format:'brick-do-snapshot-v1',deviceId:device.id,keySha256:sha(spki),capturedAt:context.capturedAt,state:{wsRevoked:true,sequenceHighWater:{epoch:1,sequence:7}}});
const body=Buffer.from(JSON.stringify({format:'brick-cardfree-d1-v1',createdAt:context.capturedAt,primary:{tables:{devices:[device]}},diagnostics:{tables:{}}}));
const capture={context,body,doSnapshots:[{id:device.id,serialized,sha256:sha(serialized)}]};
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
const encrypted=sealBackup(capture,key);
function decodeFixture(bytes){const d=createDecipheriv('aes-256-gcm',Buffer.from(key,'base64'),bytes.subarray(8,20));d.setAAD(bytes.subarray(0,8));d.setAuthTag(bytes.subarray(20,36));return JSON.parse(Buffer.concat([d.update(bytes.subarray(36)),d.final()]));}
function authenticateMalformed(change){const payload=decodeFixture(encrypted);change(payload);const magic=Buffer.from('BRICKB01'),nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'base64'),nonce);cipher.setAAD(magic);const c=Buffer.concat([cipher.update(JSON.stringify(payload)),cipher.final()]);return Buffer.concat([magic,nonce,cipher.getAuthTag(),c]);}
function changedD1(payload,change){const entry=payload.components[0],value=JSON.parse(Buffer.from(entry.bodyBase64,'base64'));change(value);const bytes=Buffer.from(JSON.stringify(value));Object.assign(entry,{bytes:bytes.length,sha256:sha(bytes),bodyBase64:bytes.toString('base64')});}
function changedDO(payload,change){const entry=payload.components[1],value=JSON.parse(Buffer.from(entry.bodyBase64,'base64'));change(value);const bytes=Buffer.from(JSON.stringify(value));Object.assign(entry,{bytes:bytes.length,sha256:sha(bytes),bodyBase64:bytes.toString('base64')});}
test('round trip preserves exact D1 and DO bytes and their hashes',()=>{const restored=openBackup(encrypted,key,context);assert.deepEqual(restored.body,body);assert.deepEqual(restored.doSnapshots,capture.doSnapshots);assert.equal(restored.sha256,sha(body));});
test('fresh nonce changes ciphertext and plaintext markers are absent',()=>{assert.notDeepEqual(sealBackup(capture,key),encrypted);for(const marker of ['brick-cardfree-d1-v1',spki,serialized,context.deployment])assert.equal(encrypted.includes(Buffer.from(marker)),false);});
test('wrong key and each binary region tamper reject before plaintext is returned',()=>{assert.throws(()=>openBackup(encrypted,wrong,context),/authentication/);for(const offset of [0,8,19,20,35,36,encrypted.length-1]){const bad=Buffer.from(encrypted);bad[offset]^=1;assert.throws(()=>openBackup(bad,key,context),/version|authentication/);}});
test('truncation extension empty and oversized envelopes reject',()=>{for(const bad of [Buffer.alloc(0),encrypted.subarray(0,35),encrypted.subarray(0,-1),Buffer.concat([encrypted,Buffer.from([0])]),Buffer.alloc(MAX_PACKAGE_BYTES+1)])assert.throws(()=>openBackup(bad,key,context));});
test('every expected context field is pinned; older or other-environment archive rejected',()=>{for(const [field,value] of Object.entries({deployment:'other',sourceSha:'c'.repeat(40),backupId:'d'.repeat(32),capturedAt:context.capturedAt-1,keyId:'other'}))assert.throws(()=>openBackup(encrypted,key,{...context,[field]:value}),/context mismatch/);assert.throws(()=>openBackup(encrypted,key,{}),/invalid backup context/);});
test('strict key encoding rejects whitespace noncanonical padding and short keys',()=>{for(const invalid of [undefined,key+'\n',key.slice(1),Buffer.alloc(31).toString('base64'),key.replace(/.$/,'A')])assert.throws(()=>backupKey(invalid));});
test('capture requires all devices and each snapshot hash',()=>{assert.throws(()=>sealBackup({...capture,doSnapshots:[]},key),/coverage/);assert.throws(()=>sealBackup({...capture,doSnapshots:[{...capture.doSnapshots[0],sha256:'0'.repeat(64)}]},key),/snapshot/);});
test('authenticated payload missing duplicate or extra component fails',()=>{for(const change of [p=>p.components.pop(),p=>p.components.push(p.components[1]),p=>p.components[0].name='unknown',p=>p.unclassified=true])assert.throws(()=>openBackup(authenticateMalformed(change),key,context));});
test('authenticated component hash length or noncanonical base64 fails',()=>{for(const change of [p=>p.components[0].sha256='0'.repeat(64),p=>p.components[0].bytes++,p=>p.components[0].bodyBase64='!'+p.components[0].bodyBase64.slice(1)])assert.throws(()=>openBackup(authenticateMalformed(change),key,context),/component/);});
test('D1 timestamp duplicate identity and invalid curve fail',()=>{for(const change of [d=>d.createdAt++,d=>d.primary.tables.devices.push(device),d=>d.primary.tables.devices[0].public_key_spki_b64=generateKeyPairSync('ec',{namedCurve:'secp384r1'}).publicKey.export({format:'der',type:'spki'}).toString('base64')])assert.throws(()=>openBackup(authenticateMalformed(p=>changedD1(p,change)),key,context));});
test('DO foreign device key unknown state bad marker and nested state fail',()=>{for(const change of [d=>d.deviceId='other',d=>d.keySha256='0'.repeat(64),d=>d.state.futureUnknown={},d=>d.state.wsRevoked='true',d=>d.state.sequenceHighWater.sequence=-1,d=>{let v={};for(let i=0;i<34;i++)v={next:v};d.state.latest=v;}])assert.throws(()=>openBackup(authenticateMalformed(p=>changedDO(p,change)),key,context));});
test('seal enforces D1 and per-device bounds and immutable input',()=>{assert.throws(()=>sealBackup({...capture,body:new Uint8Array(16*1024*1024+1)},key),/envelope/);const huge='a'.repeat(64*1024+1);assert.throws(()=>sealBackup({...capture,doSnapshots:[{id:device.id,serialized:huge,sha256:sha(huge)}]},key),/snapshot/);assert.deepEqual(openBackup(encrypted,key,context).body,body);});
test('CLI uses private exclusive output and metadata-only verification with redacted failure',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'brick-package-'));
 try {
  const d1=path.join(dir,'d1.json'),snapshot=path.join(dir,'do.json'),spec=path.join(dir,'capture.json'),expected=path.join(dir,'expected.json'),output=path.join(dir,'sealed.brickbackup');
  fs.writeFileSync(d1,body);fs.writeFileSync(snapshot,serialized);fs.writeFileSync(spec,JSON.stringify({context,d1Path:d1,devices:[{id:device.id,path:snapshot}]}));fs.writeFileSync(expected,JSON.stringify(context));
  const run=(action,a,b,k=key)=>spawnSync(process.execPath,['scripts/phase8d-protected-backup.mjs',action,a,b],{encoding:'utf8',env:{...process.env,BRICK_BACKUP_ENCRYPTION_KEY:k}});
  const seal=run('seal',spec,output);assert.equal(seal.status,0,seal.stderr);assert.equal(fs.statSync(output).mode&0o777,0o600);const before=fs.readFileSync(output);
  assert.equal(run('seal',spec,output).status,1);assert.deepEqual(fs.readFileSync(output),before);
  const verified=run('verify',output,expected);assert.equal(verified.status,0,verified.stderr);assert.equal(JSON.parse(verified.stdout).status,'VERIFIED');
  const refused=run('verify',output,expected,wrong);assert.equal(refused.status,1);assert.equal(refused.stdout,'');
  for(const result of [seal,verified,refused])for(const secret of [key,wrong,spki,serialized])assert.equal((result.stdout+result.stderr).includes(secret),false);
  assert.equal(fs.readdirSync(dir).some(f=>f.includes('.tmp-')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
console.log(`Protected backup suite: ${passed} passed, 0 failed (synthetic/off-platform; no live capture or cloud qualification)`);
