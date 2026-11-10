// Explicit operator entry only. No workflow, runtime bootstrap or default activation.
// Build on a clean pinned checkout; supply a separately protected private config.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createCaptureBrokerClient} from '../src/capture-broker-client';
// BRICK_OPERATOR_SOURCE_SHA is supplied by the clean-checkout build.
const tools={publication:'publish-beta-d1-release.mjs',probe:'verify-beta-live.mjs',schema:'ensure-beta-d1-columns.mjs',deployment:'setup-beta-d1.mjs'};
const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const hex=(v,n)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v);
const uuid=(v)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const fail=()=>{throw Error('PINNED_OPERATOR_UNQUALIFIED');};
function config(file){
 if(!path.isAbsolute(file)||path.resolve(file)!==file||typeof fs.constants.O_NOFOLLOW!=='number'||typeof fs.constants.O_NONBLOCK!=='number')fail();
 const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);let bytes;
 try{
  const s=fs.fstatSync(fd);if(!s.isFile()||s.nlink!==1||(s.mode&0o077)||s.uid!==process.getuid()||s.size<1||s.size>16384)fail();
  bytes=Buffer.alloc(s.size);let offset=0;while(offset<bytes.length){const n=fs.readSync(fd,bytes,offset,bytes.length-offset,null);if(!n)fail();offset+=n;}
  if(fs.readSync(fd,Buffer.alloc(1),0,1,null))fail();const after=fs.fstatSync(fd);if(s.size!==after.size||s.mtimeMs!==after.mtimeMs||s.ctimeMs!==after.ctimeMs)fail();
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }finally{bytes?.fill(0);fs.closeSync(fd);}
}
async function main(){
 const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--config'||args[2]!=='--tool'||!Object.hasOwn(tools,args[3]))fail();
 const tool=args[3],c=config(args[1]);
 if(!exact(c,['format','operatorSourceSha','url','pin','key','scope'])||c.format!=='brick-pinned-beta-operator-v1'||c.operatorSourceSha!==BRICK_OPERATOR_SOURCE_SHA||!hex(c.operatorSourceSha,40))fail();
 if(!exact(c.pin,['sourceSha','resourceSetSha256','authorityEpoch'])||!hex(c.pin.sourceSha,40)||!hex(c.pin.resourceSetSha256,64)||!hex(c.pin.authorityEpoch,32))fail();
 if(!exact(c.key,['id','role','base64'])||c.key.role!=='external-writer'||typeof c.key.id!=='string'||!/^[-_a-zA-Z0-9]{1,48}$/.test(c.key.id)||typeof c.key.base64!=='string')fail();
 if(!exact(c.scope,['accountId','databaseIds','workerName','workerHost'])||!hex(c.scope.accountId,32)||c.scope.workerName!=='brick-family-beta'||typeof c.scope.workerHost!=='string'||!/^brick-family-beta\.[a-z0-9-]+\.workers\.dev$/.test(c.scope.workerHost)||!Array.isArray(c.scope.databaseIds)||c.scope.databaseIds.length!==2||c.scope.databaseIds.some(x=>!uuid(x))||new Set(c.scope.databaseIds).size!==2)fail();
 if(typeof c.url!=='string')fail();const url=new URL(c.url);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.search||url.href!==c.url)fail();
 if(process.env.GITHUB_SHA!==c.pin.sourceSha||tool==='deployment'&&c.operatorSourceSha!==c.pin.sourceSha)fail();
 const self=fileURLToPath(import.meta.url),root=path.dirname(path.dirname(self));
 if(path.basename(self)!=='.brick-operator-launcher.mjs'||fs.realpathSync(self)!==self||fs.realpathSync(root)!==root)fail();
 const git=(args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 if(git(['rev-parse','HEAD'])!==BRICK_OPERATOR_SOURCE_SHA)fail();
 git(['diff','--quiet','HEAD','--']);
 if(git(['ls-files','--others','--exclude-standard','--','src','scripts','schema']).split('\n').filter(v=>v&&v!=='scripts/.brick-operator-launcher.mjs').length)fail();
 const key=Buffer.from(c.key.base64,'base64');if(key.length!==32||key.toString('base64')!==c.key.base64){key.fill(0);fail();}
 try{
  const client=await createCaptureBrokerClient({url:c.url,pin:c.pin,key:{id:c.key.id,role:'external-writer',bytes:key},request:fetch});
  const allowed=new Set(['ADMISSION_UNCERTAIN','START_UNCERTAIN','CANCELLATION_UNCERTAIN','RESERVATION_CANCELLED','WORK_OUTCOME_UNCERTAIN','RELEASE_UNCERTAIN']);let uncertain=false;
  // Defer even the shared controller import until the checkout is verified.
  // Otherwise a modified helper could execute before a dirty-tree refusal.
  const {installStagedExternalWriterController}=await import(pathToFileURL(path.join(root,'scripts/staged-external-writer.mjs')).href);
  installStagedExternalWriterController({sourceSha:c.pin.sourceSha,resourceSetSha256:c.pin.resourceSetSha256,...c.scope},{...client.externalController(code=>{if(code!=='RESERVATION_CANCELLED')uncertain=true;console.error('Pinned operator notice: '+(allowed.has(code)?code:'UNQUALIFIED'));}),timeoutMs:15000});
  // Selection is a fixed source allowlist, never a path/URL from private config.
  await import(pathToFileURL(path.join(root,'scripts',tools[tool])).href);
  if(uncertain)fail(); // completed work with unknown release is not a clean operator exit
 }finally{key.fill(0);}
}
main().catch(()=>{console.error('Pinned operator refused or outcome uncertain; inspect protected authority state before retrying.');process.exitCode=2;});
