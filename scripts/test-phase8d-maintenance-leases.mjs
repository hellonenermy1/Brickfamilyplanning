import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const dir=fs.mkdtempSync(path.resolve('.brick-maintenance-leases-'));
await build({entryPoints:['src/maintenance-task.ts'],outfile:path.join(dir,'task.mjs'),bundle:true,platform:'node',format:'esm'});
const {runMaintenanceTask,awaitScheduledWork,MAINTENANCE_LEASE_MS}=await import(pathToFileURL(path.join(dir,'task.mjs')).href);
const mf=new Miniflare(convertV4MiniflareOptions({name:'maintenance-lease',modules:true,script:'export default{fetch(){return new Response("synthetic");}}',compatibilityDate:'2026-10-29',d1Databases:['DB']}));
let passed=0,failed=0;const originalNow=Date.now;
const test=async(name,fn)=>{try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}finally{Date.now=originalNow;}};
try{
 const db=await mf.getD1Database('DB');for(const sql of fs.readFileSync('schema/013_phase6c_request_maintenance.sql','utf8').replace(/--[^\n]*/g,'').split(';').filter(x=>x.trim()))await db.prepare(sql).run();
 await test('nested waitUntil work drains before completion and rejection is propagated',async()=>{let nested=false,other=false;await assert.rejects(()=>awaitScheduledWork(async ctx=>{ctx.waitUntil(Promise.resolve().then(()=>{ctx.waitUntil(new Promise(r=>setTimeout(()=>{nested=true;r();},20)));}));ctx.waitUntil(Promise.reject(Error('synthetic')));ctx.waitUntil(new Promise(r=>setTimeout(()=>{other=true;r();},10)));},{}),/scheduled maintenance/);assert.equal(nested,true);assert.equal(other,true);});
 await test('failed work releases its own claim for immediate automatic retry',async()=>{await assert.rejects(()=>runMaintenanceTask(db,'failure-v2',86400000,async()=>{throw Error('synthetic');}),/task failed/);let ran=false;assert.equal(await runMaintenanceTask(db,'failure-v2',86400000,async()=>{ran=true;}),'COMPLETED');assert.equal(ran,true);});
 await test('concurrent claimant is BUSY and does not duplicate active work',async()=>{let release,entered;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const owner=runMaintenanceTask(db,'concurrent-v2',60000,async()=>{entered();await gate;});await started;assert.equal(await runMaintenanceTask(db,'concurrent-v2',60000,async()=>assert.fail('duplicate')),'BUSY');release();assert.equal(await owner,'COMPLETED');assert.equal(await runMaintenanceTask(db,'concurrent-v2',60000,async()=>assert.fail('immediate repeat')),'SKIPPED');});
 await test('failed old owner cannot delete a newer task owner',async()=>{const at=Date.now();await assert.rejects(()=>runMaintenanceTask(db,'newowner-v2',60000,async()=>{await db.prepare('UPDATE dev_maintenance_state SET last_run_at=?1 WHERE task=?2').bind(-(at+10000),'newowner-v2').run();throw Error('old failed');}),/task failed/);assert.equal((await db.prepare('SELECT last_run_at FROM dev_maintenance_state WHERE task=?1').bind('newowner-v2').first()).last_run_at,-(at+10000));});
 await test('failed release-write does not suppress daily retry until tomorrow',async()=>{const at=Date.now();Date.now=()=>at;const outage={prepare(sql){if(sql.startsWith('DELETE FROM dev_maintenance_state'))return{bind(){return{async run(){throw Error('synthetic D1 release outage');}};}};return db.prepare(sql);}};await assert.rejects(()=>runMaintenanceTask(outage,'release-v2',86400000,async()=>{throw Error('failed');}),/task failed/);assert.equal(await runMaintenanceTask(db,'release-v2',86400000,async()=>assert.fail('lease not expired')),'BUSY');Date.now=()=>at+MAINTENANCE_LEASE_MS+1;assert.equal(await runMaintenanceTask(db,'release-v2',86400000,async()=>{}),'COMPLETED');});
 await test('interval starts at confirmed completion, not initial claim',async()=>{const at=Date.now();Date.now=()=>at;await runMaintenanceTask(db,'completion-v2',60000,async()=>{Date.now=()=>at+30000;});assert.equal((await db.prepare('SELECT last_run_at FROM dev_maintenance_state WHERE task=?1').bind('completion-v2').first()).last_run_at,at+30000);});
 await test('unversioned task names cannot mix old lease protocols',async()=>{await assert.rejects(()=>runMaintenanceTask(db,'beta-daily',86400000,async()=>{}),/invalid maintenance task/);});
 console.log(JSON.stringify({suite:'maintenance-leases',passed,failed,scope:'actual local D1; synthetic tasks and controlled clock only'}));if(failed)process.exitCode=1;
}finally{Date.now=originalNow;await mf.dispose();fs.rmSync(dir,{recursive:true,force:true});}
