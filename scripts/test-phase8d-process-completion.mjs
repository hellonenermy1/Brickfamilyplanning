import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runExternalProcess as run} from './external-process-completion.mjs';
import {installStagedExternalWriterController,runStagedExternalWriter} from './staged-external-writer.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'brick-process-close-'));
const pin={sourceSha:'a'.repeat(40),accountId:'b'.repeat(32),resourceSetSha256:'c'.repeat(64),databaseIds:['cccccccc-1111-4111-8111-cccccccccccc'],workerName:'brick-family-beta',workerHost:'brick-family-beta.fixture.workers.dev'};
const scope={sourceSha:pin.sourceSha,accountId:pin.accountId,databaseId:pin.databaseIds[0],workerName:pin.workerName,workerHost:pin.workerHost};
const active=new Set(),notices=[];let released=0,passed=0;
installStagedExternalWriterController(pin,{
  async enter({writerId}){active.add(writerId);return{admitted:true,ticket:{authorityEpoch:'d'.repeat(32),writerId,tracked:true}};},
  async exit(ticket){assert(active.delete(ticket.writerId));released++;return{released:true};},
  notice(code){notices.push(code);}
});
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
async function until(fn){const deadline=Date.now()+10000;while(!fn()){if(Date.now()>deadline)throw Error('fixture condition timed out');await new Promise(r=>setTimeout(r,10));}}
try{
  await test('normal output closes successfully and capture preserves stream content',async()=>{
    const output=await run(process.execPath,['-e','process.stdout.write("out");process.stderr.write("err");'],{capture:true,quiet:true});assert.equal(output.length,6);assert(output.includes('out'));assert(output.includes('err'));
  });
  await test('noncapturing quiet command returns no retained output',async()=>{
    assert.equal(await run(process.execPath,['-e','process.stdout.write("not retained")'],{quiet:true}),'');
  });
  await test('private stdin reaches the child without being returned',async()=>{
    assert.equal(await run(process.execPath,['-e','let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.exit(s==="synthetic-private\\n"?0:2));'],{input:'synthetic-private\n',quiet:true}),'');
  });
  for(const capture of [false,true])await test('inherited descendant pipes keep writer active until actual close; capture='+capture,async()=>{
    const dir=path.join(root,String(capture));fs.mkdirSync(dir);const ready=path.join(dir,'parent-exiting'),finish=path.join(dir,'finish'),done=path.join(dir,'done');
    const descendant=`const fs=require('node:fs');const t=setInterval(()=>{if(fs.existsSync(${JSON.stringify(finish)})){clearInterval(t);fs.writeFileSync(${JSON.stringify(done)},'complete');}},10);setTimeout(()=>process.exit(3),10000).unref();`;
    const parent=`const fs=require('node:fs');require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore',process.stdout,process.stderr]});fs.writeFileSync(${JSON.stringify(ready)},'ready');process.exit(0);`;
    const before=released;let settled=false;
    const pending=runStagedExternalWriter('probe',scope,()=>run(process.execPath,['-e',parent],{capture,quiet:true})).then(v=>{settled=true;return v;});
    await until(()=>fs.existsSync(ready));
    // Synchronize with the parent marker, not a race to beat child startup.
    await new Promise(r=>setTimeout(r,100));
    try{assert.equal(settled,false);assert.equal(active.size,1);assert.equal(released,before);assert(!fs.existsSync(done));}
    finally{fs.writeFileSync(finish,'finish');}
    await pending;assert(fs.existsSync(done));assert.equal(active.size,0);assert.equal(released,before+1);
  });
  await test('nonzero outcome retains ownership and redacts child error output',async()=>{
    const before=released;await assert.rejects(runStagedExternalWriter('probe',scope,()=>run(process.execPath,['-e','process.stderr.write("synthetic-private-value");process.exit(2)'],{quiet:true})),e=>e.message==='EXTERNAL_PROCESS_OUTCOME_UNCERTAIN');
    assert.equal(active.size,1);assert.equal(released,before);assert(notices.includes('WORK_OUTCOME_UNCERTAIN'));active.clear();
  });
  await test('signalled outcome cannot be interpreted as successful completion',async()=>{
    await assert.rejects(run(process.execPath,['-e','process.kill(process.pid,"SIGTERM")'],{quiet:true}),/OUTCOME_UNCERTAIN/);
  });
  await test('spawn error closes without hanging or exposing command parameters',async()=>{
    await assert.rejects(run(path.join(root,'missing-command'),['synthetic-private-value'],{quiet:true}),e=>e.message==='EXTERNAL_PROCESS_IO_UNCERTAIN');
  });
  await test('stdin EPIPE is a failure even when child exits zero',async()=>{
    await assert.rejects(run(process.execPath,['-e','process.exit(0)'],{input:Buffer.alloc(4*1024*1024),quiet:true}),/IO_UNCERTAIN/);
  });
  await test('setup ordinary and private-secret subprocesses both use close helper',()=>{
    const source=fs.readFileSync('scripts/setup-beta-d1.mjs','utf8');assert(source.includes("import {runExternalProcess as run} from './external-process-completion.mjs'"));assert(source.includes("{input:loginHash+'\\n',quiet:true}"));assert(!/\bspawn\(/.test(source));assert(!/\.on\('exit'/.test(source));
  });
  console.log(JSON.stringify({suite:'external-process-completion',passed,failed:0,scope:'actual local child/pipe/descendant/error/stdin processes with staged synthetic writer ownership; inherited-pipe closure only, no detached-descendant, remote rollback, full process-tree or production qualification'}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
