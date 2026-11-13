// Source-integrity fixtures only; no operator/controller/cloud installation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {assertPinnedOperatorCheckout} from './pinned-operator-checkout.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'brick-pinned-bytes-'));
let passed=0;
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
try{
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
 fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'src'));
 const file=path.join(root,'scripts/operator.mjs'),original=Buffer.from('export const marker=1;\n');
 fs.writeFileSync(file,original);fs.writeFileSync(path.join(root,'.gitignore'),'scripts/hidden.mjs\n');git('add','.');git('commit','-qm','synthetic baseline');
 const sha=git('rev-parse','HEAD'),verify=()=>assertPinnedOperatorCheckout(root,sha);
 test('clean committed byte identity succeeds',()=>assert.equal(verify().trackedFilesVerified,2));
 for(const flag of ['assume-unchanged','skip-worktree'])test(flag+' does not exempt bytes',()=>{try{git('update-index','--'+flag,'scripts/operator.mjs');fs.appendFileSync(file,'// hidden\n');git('diff','--quiet','HEAD','--');assert.throws(verify);}finally{fs.writeFileSync(file,original);git('update-index','--no-'+flag,'scripts/operator.mjs');}});
 test('same-size source mutation is refused',()=>{try{fs.writeFileSync(file,original.toString().replace('=1','=2'));assert.throws(verify);}finally{fs.writeFileSync(file,original);}});
 test('executable mode changes are refused',()=>{try{fs.chmodSync(file,0o755);assert.throws(verify);}finally{fs.chmodSync(file,0o644);}});
 test('symlinked tracked file refuses even with matching target bytes',()=>{const saved=file+'.saved';try{fs.renameSync(file,saved);fs.symlinkSync(saved,file);assert.throws(verify);}finally{fs.rmSync(file);fs.renameSync(saved,file);}});
 test('multiply linked tracked file refuses',()=>{const link=file+'.link';try{fs.linkSync(file,link);assert.throws(verify);}finally{fs.rmSync(link);}});
 test('ignored extra source refuses',()=>{const hidden=path.join(root,'scripts/hidden.mjs');try{fs.writeFileSync(hidden,'// ignored');assert.equal(git('ls-files','--others','--exclude-standard'),'');assert.throws(verify);}finally{fs.rmSync(hidden);}});
 test('staged alternative bytes refuse even after worktree bytes are restored',()=>{try{fs.writeFileSync(file,'// staged substitution\n');git('add','scripts/operator.mjs');fs.writeFileSync(file,original);assert.throws(verify);}finally{git('reset','-q',sha,'--','scripts/operator.mjs');}});
 test('replacement commit cannot substitute the expected tree',()=>{const originalCommit=git('cat-file','commit',sha);try{fs.appendFileSync(file,'// replacement\n');git('add','.');git('commit','-qm','replacement');const replacement=git('rev-parse','HEAD');git('reset','--soft',sha);git('replace',sha,replacement);assert.throws(verify);assert.notEqual(git('cat-file','commit',sha),originalCommit);}finally{git('replace','-d',sha);git('reset','--hard',sha);}});
 test('empty and wrong commit pins refuse',()=>{assert.throws(()=>assertPinnedOperatorCheckout(root,''));assert.throws(()=>assertPinnedOperatorCheckout(root,'0'.repeat(40)));});
 test('restored clean fixture remains usable',()=>assert.equal(verify().sourceSha,sha));
 console.log(JSON.stringify({suite:'pinned-checkout-byte-integrity',passed,failed:0,scope:'local pinned Git blob/physical file identity only; no immutable host, trusted toolchain or concurrent modification protection'}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
