// Read-only LOCAL reachable Git object audit. Never emits matching values/lines.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const RULES = [
  ['private-key-material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\r\n]{64,}-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-classic-token', /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/],
  ['github-fine-grained-token', /\bgithub_pat_[A-Za-z0-9_]{60,255}\b/],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,255}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/]
];
// Known earlier P8D-003 verifier. Presence is provenance, not proof of a live secret.
const WEAK = '931967fb6beab2e36f903438e73707c7e34bfec84c2492bb5cabc197e7bbc77d';
export function categories(bytes, filename = '') {
  const text = bytes.toString('utf8'), result = [];
  for (const [label, expression] of RULES) if (expression.test(text)) result.push(label);
  if (text.toLowerCase().includes(WEAK)) result.push('known-historical-weak-verifier-marker');
  if (bytes.length && /\.(?:jks|keystore|p12|pfx)$/i.test(filename)) result.push('credential-container-needs-review');
  return result;
}
function git(args, input, maxBuffer = 64 * 1024 * 1024) {
  const r = spawnSync('git', args, {input, maxBuffer});
  if (r.error || r.status !== 0) throw Error('Git audit plumbing failed: ' + args[0]);
  return r.stdout;
}
export function auditLocalHistory() {
  const shallow = git(['rev-parse','--is-shallow-repository']).toString().trim() === 'true';
  if (shallow) throw Error('Incomplete shallow history: fetch full authorized refs before qualification');
  const head = git(['rev-parse','HEAD']).toString().trim();
  const refs = git(['for-each-ref','--format=%(refname) %(objectname)']).toString().trim().split('\n').filter(Boolean);
  const list = git(['rev-list','--objects','--all']).toString().trim().split('\n').filter(Boolean);
  const paths = new Map(list.map(l => {const i=l.indexOf(' ');return i<0?[l,'']:[l.slice(0,i),l.slice(i+1)];}));
  const meta = git(['cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'], [...paths.keys()].join('\n')+'\n').toString().trim().split('\n').map(l=>l.split(' '));
  const blobs = meta.filter(x=>x[1]==='blob');
  const totalBytes=blobs.reduce((n,x)=>n+Number(x[2]),0);
  if(totalBytes>256*1024*1024||blobs.some(x=>Number(x[2])>32*1024*1024))throw Error('History exceeds bounded scan envelope; no silent skipping');
  const batch=git(['cat-file','--batch'],blobs.map(x=>x[0]).join('\n')+'\n',totalBytes+blobs.length*128+1024);
  let offset=0; const matches=[];
  for(const [sha,,sizeString] of blobs){
    const end=batch.indexOf(10,offset);assert(end>=offset,'missing Git blob header');
    const [found,type,size]=batch.subarray(offset,end).toString().split(' ');
    assert.equal(found,sha);assert.equal(type,'blob');assert.equal(size,sizeString);
    const count=Number(size);const bytes=batch.subarray(end+1,end+1+count);assert.equal(bytes.length,count);
    const labels=categories(bytes,paths.get(sha));
    if(labels.length)matches.push({blobSha:sha,observedPath:paths.get(sha),categories:labels});
    offset=end+1+count+1;
  }
  assert.equal(offset,batch.length,'unconsumed Git blob bytes');
  return {format:'brick-local-git-secret-audit-v1',head,shallow,refs,reachableCommits:Number(git(['rev-list','--count','--all']).toString()),blobCount:blobs.length,totalBytes,
    coverage:'All blobs reachable from recorded LOCAL refs; not remote unadvertised/deleted refs, dangling objects, LFS payloads, release assets, deployed logs or rotation proof',
    status:matches.length?'FINDINGS_REVIEW_REQUIRED':'NO_HIGH_CONFIDENCE_MATCH',matches};
}
function selfTest(){
 assert.deepEqual(categories(Buffer.from('const publicKey = "public only"')),[]);
 assert(categories(Buffer.from('ghp_'+'a'.repeat(36))).includes('github-classic-token'));
 assert(categories(Buffer.from('github_pat_'+'b'.repeat(70))).includes('github-fine-grained-token'));
 assert(categories(Buffer.from('xoxb-'+'1'.repeat(30))).includes('slack-token'));
 assert(categories(Buffer.from('AIza'+'a'.repeat(35))).includes('google-api-key'));
 assert(categories(Buffer.from('-----BEGIN PRIVATE KEY-----\n'+'a'.repeat(100)+'\n-----END PRIVATE KEY-----')).includes('private-key-material'));
 assert(!categories(Buffer.from('-----BEGIN PRIVATE KEY-----')).includes('private-key-material'));
 assert(categories(Buffer.from([0,1,2]),'synthetic.jks').includes('credential-container-needs-review'));
 assert(categories(Buffer.from(WEAK)).includes('known-historical-weak-verifier-marker'));
 console.log('PASS 8D.15 local Git scanner positive/negative controls; matching secret values are never emitted');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 if(process.argv[2]==='--self-test')selfTest();
 else{
  const output=process.argv[2];if(!output)throw Error('usage: phase8d-secret-history-audit.mjs <sanitized-output.json> | --self-test');
  const report=auditLocalHistory();fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,head:report.head,commits:report.reachableCommits,blobs:report.blobCount,bytes:report.totalBytes,matchedBlobs:report.matches.length}));
  if(report.matches.length)process.exitCode=2;
 }
}
