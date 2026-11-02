import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const [modulePath] = process.argv.slice(2);
if (!modulePath) throw new Error('usage: test-phase8-parent-origin.mjs <dev-parent-auth-module>');
const auth = await import(pathToFileURL(modulePath).href + `?v=${Date.now()}`);

const base = 'https://brick-dev.example.com/parent/api/device/child/state';
const allowed = auth.devParentOriginAllowed;

assert.equal(allowed(new Request(base, { method: 'GET' })), true, 'safe GET may omit Origin');
assert.equal(allowed(new Request(base, { method: 'HEAD' })), true, 'safe HEAD may omit Origin');
assert.equal(allowed(new Request(base, { method: 'POST' })), false, 'state-changing request without Origin must fail closed');
assert.equal(allowed(new Request(base, { method: 'POST', headers: { Origin: 'https://brick-dev.example.com' } })), true);
assert.equal(allowed(new Request(base, { method: 'POST', headers: { Origin: 'https://evil.example.com' } })), false);
assert.equal(allowed(new Request(base, { method: 'POST', headers: { Origin: 'http://brick-dev.example.com' } })), false, 'scheme mismatch is cross-origin');
assert.equal(allowed(new Request(base, { method: 'DELETE', headers: { Origin: 'not a url' } })), false);
assert.equal(allowed(new Request(base, { method: 'PUT', headers: { Origin: 'https://brick-dev.example.com.evil.test' } })), false);

console.log('Phase 8 parent same-origin mutation contract OK');
