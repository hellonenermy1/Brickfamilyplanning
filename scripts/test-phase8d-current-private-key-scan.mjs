import assert from 'node:assert/strict';
import { scanPrivateKeyMaterial } from './phase8d-current-private-key-scan.mjs';
const body='a'.repeat(128), key='-----BEGIN PRIVATE KEY-----\n'+body+'\n-----END PRIVATE KEY-----';
const samples={
 'marker-only.mjs':Buffer.from("const marker = '-----BEGIN PRIVATE KEY-----';"),
 'public-key.mjs':Buffer.from('-----BEGIN PUBLIC KEY-----\n'+body+'\n-----END PUBLIC KEY-----'),
 'material.mjs':Buffer.from(key),
 'json-escaped.mjs':Buffer.from(JSON.stringify({key})),
 'indented.mjs':Buffer.from(key.split('\n').map(x=>'    '+x).join('\n')),
 'encrypted.mjs':Buffer.from(key.replaceAll('PRIVATE KEY','ENCRYPTED PRIVATE KEY'))
};
assert.deepEqual(scanPrivateKeyMaterial(Object.keys(samples),p=>samples[p]).map(x=>x.path),['material.mjs','json-escaped.mjs','indented.mjs','encrypted.mjs']);
assert.throws(()=>scanPrivateKeyMaterial(['oversized'],()=>({length:32*1024*1024+1})),/bounded/);
console.log('PASS P8D-065 seven material/escaped/indented/encrypted/marker/public/size cases; no private values emitted');
