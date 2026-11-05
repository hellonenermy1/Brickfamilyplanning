// Explicit off-platform packaging/verification only. Never captures live stores.
import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {sealBackup,openBackup,MAX_PACKAGE_BYTES} from './cardfree-backup-package.mjs';

function readBounded(file,limit) {
  const fd=fs.openSync(file,'r');
  try {
    const stat=fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw Error('input file exceeds envelope');
    const buffer=Buffer.alloc(stat.size);let offset=0;
    while (offset < buffer.length) { const n=fs.readSync(fd,buffer,offset,buffer.length-offset,null);if (!n) throw Error('incomplete input file');offset+=n; }
    if (fs.readSync(fd,Buffer.alloc(1),0,1,null)) throw Error('input file changed during read');
    return buffer;
  } finally { fs.closeSync(fd); }
}
function publishExclusive(output,bytes) {
  const temp=output+'.tmp-'+randomBytes(12).toString('hex');
  let fd;
  try {
    fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    // Atomic publication on this filesystem, refuses to replace an existing file.
    fs.linkSync(temp,output);
  } finally { if (fd !== undefined) fs.closeSync(fd);fs.rmSync(temp,{force:true}); }
}
try {
  const [action,input,output,...extra]=process.argv.slice(2);
  if (extra.length || !input || !output || !['seal','verify'].includes(action)) throw Error('usage: phase8d-protected-backup.mjs seal capture.json output.brickbackup | verify backup.brickbackup trusted-context.json');
  const key=process.env.BRICK_BACKUP_ENCRYPTION_KEY;
  if (action === 'seal') {
    const capture=JSON.parse(readBounded(input,1024*1024).toString('utf8'));
    if (!Array.isArray(capture.devices) || capture.devices.length > 1000) throw Error('invalid capture inventory');
    const body=readBounded(capture.d1Path,16*1024*1024);
    const doSnapshots=capture.devices.map(({id,path})=>{
      const serialized=readBounded(path,64*1024).toString('utf8');
      // Hash is recomputed; the package validator checks D1/device coverage/identity.
      return {id,serialized,sha256:createDigest(serialized)};
    });
    const bytes=sealBackup({context:capture.context,body,doSnapshots},key);
    publishExclusive(output,bytes);
    console.log(JSON.stringify({status:'SEALED',encryptedBytes:bytes.length,sha256:createDigest(bytes),context:capture.context}));
  } else {
    const context=JSON.parse(readBounded(output,4096).toString('utf8'));
    const restored=openBackup(readBounded(input,MAX_PACKAGE_BYTES),key,context);
    console.log(JSON.stringify({status:'VERIFIED',context:restored.context,devices:restored.doSnapshots.length}));
  }
} catch {
  // Neither exception detail nor paths/data/keys are printed to shared CI logs.
  console.error('Protected backup operation failed; verify local inputs, trusted context, key and destination.');
  process.exitCode=1;
}
function createDigest(value) { return createHash('sha256').update(value).digest('hex'); }
import {createHash} from 'node:crypto';
