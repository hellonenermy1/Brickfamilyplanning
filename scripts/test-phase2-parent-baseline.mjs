// Source-level regression checks for the Phase 2 parent safety overlay.
// No cloud, login secret, device data or private map required.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {pbkdf2Sync,randomBytes} from 'node:crypto';

const source=readFileSync('src/parent-beta.ts','utf8');
const begin=source.indexOf('function p2SafetyKey(e)');
const end=source.indexOf('const p2OriginalLabel=labelEvent;',begin);
assert(begin>=0&&end>begin,'Phase 2 safety helpers are present');
const context=vm.createContext({});
vm.runInContext(source.slice(begin,end),context,{timeout:1000});
const group=context.p2GroupFallEvents;
const at=Date.UTC(2026,10,6,13,13,31);
const nine=Array.from({length:9},(_,i)=>({id:'fall-'+i,kind:'fall_detected',server_created_at:at+1000*i}));
let result=group(nine);
assert.equal(result.length,1,'nine fall events in ten seconds group into one row');
assert.equal(result[0].records.length,9,'grouping retains all nine original records');
result=group([...nine,nine[0]]);
assert.equal(result[0].records.length,9,'stable event ID must prevent duplicate row');
result=group([...nine,{id:'sos-1',kind:'sos_started',server_created_at:at+4000}]);
assert(result.some(x=>x.kind==='sos_started'),'SOS must remain independently visible');
assert.equal(result.flatMap(x=>x.records).length,10,'grouping must not delete real distinct records');
const distant={id:'fall-distant',kind:'fall_detected',server_created_at:at+121000};
result=group([...nine,distant]);
assert.equal(result.length,2,'distant fall events must not collapse indefinitely');

const parentAuth=readFileSync('src/dev-parent-auth.ts','utf8');
assert(parentAuth.includes('minlength="15"'),'login form must support the requested 15-character passphrase');
assert(parentAuth.includes('PBKDF2'),'slow password verification must be present');
assert(parentAuth.includes('devParentOriginAllowed'),'origin/CSRF remains present');
assert(parentAuth.includes('devParentSessionValid'),'D1 session authentication remains present');
const setup=readFileSync('scripts/setup-beta-d1.mjs','utf8');
assert(setup.includes('pbkdf2Sync(devAccessToken,salt,240000,32'),'provisioning derives the correct slow verifier');
assert(setup.includes('revokePriorDevelopmentSessions'),'session revocation preserved');
const sample='Phase2-test-passphrase-strong-abc';
const salt=randomBytes(16),iterations=240000;
const digest=pbkdf2Sync(sample,salt,iterations,32,'sha256');
const stored='pbkdf2-sha256:'+iterations+':'+salt.toString('base64url')+':'+digest.toString('base64url');
const parts=/^pbkdf2-sha256:(\d{6}):([A-Za-z0-9_-]{22,64}):([A-Za-z0-9_-]{43})$/.exec(stored);
assert(parts,'generated verifier must match browser-worker format');
assert.deepEqual(pbkdf2Sync(sample,Buffer.from(parts[2],'base64url'),Number(parts[1]),32,'sha256'),digest);
assert.notDeepEqual(pbkdf2Sync('wrong',salt,iterations,32,'sha256'),digest);
console.log('Phase 2 parent safety grouping, SOS independence, auth and KDF source checks PASS');
