// Prevent routine beta deployment from invalidating a parent's live D1 sessions.
// Validates isolated setup sequencing without contacting Cloudflare or using credentials.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('scripts/setup-beta-d1.mjs','utf8');
const revocation='await revokePriorDevelopmentSessions((sql, params) => d1Query(d1Id, sql, params));';
const count=source.split(revocation).length-1;
assert.equal(count,1,'exactly one revocation operation must exist');
const start=source.indexOf('if(provisionLogin){');
const end=source.indexOf("console.log('[card-free dev 6/6]");
assert(start>0&&end>start,'secret rotation must have a bounded guarded block');
const pre=source.slice(0,start),inside=source.slice(start,end);
assert(!pre.includes(revocation),'routine deployments must not revoke existing sessions');
assert(inside.includes(revocation),'real credential rotation must revoke existing sessions');
assert(inside.indexOf("child.stdin.end(loginHash")<inside.indexOf(revocation),'revoke only after successful secret provisioning');
assert(source.includes('priorSessionsRevoked: provisionLogin,'),'deployment metadata must reflect actual revocation');
console.log('PASS: unchanged parent credentials preserve D1 sessions; verified rotations revoke after secret provisioning');
