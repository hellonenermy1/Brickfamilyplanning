// Focused tracked-source release check; values stay in memory. Container filename
// prohibition remains a separate, unchanged production workflow check.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { categories } from './phase8d-secret-history-audit.mjs';
export function scanPrivateKeyMaterial(files,read){
 const findings=[];
 for(const name of files){const bytes=read(name);if(bytes.length>32*1024*1024)throw Error('Tracked file exceeds bounded private-key scan');
  if(categories(bytes,name).includes('private-key-material'))findings.push({path:name,category:'private-key-material'});
 }
 return findings;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 const findings=scanPrivateKeyMaterial(files,p=>fs.readFileSync(p));
 if(findings.length){console.error(JSON.stringify({status:'REFUSED',findings}));process.exitCode=1;}
 else console.log('PASS tracked private-key material scan: '+files.length+' files; marker-only source controls are not key material. Other credential classes/history/rotation require separate audit.');
}
