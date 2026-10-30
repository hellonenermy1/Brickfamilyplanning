import assert from 'node:assert/strict';
const mod = await import(process.argv[2]);
const { validCrashReport } = mod;
const good = {
  protocol: 1,
  reportId: '123e4567-e89b-42d3-a456-426614174000',
  appVersion: '0.5.1-phase5c',
  module: 'location.service',
  exceptionSignature: '0123456789abcdef0123456789abcdef',
  createdAtMs: 1800000000000
};
assert.equal(validCrashReport(good), true, 'minimal crash report should validate');
for (const [key, value] of [
  ['latitude', 1.3], ['longitude', 103.8], ['location', 'home'], ['coordinates', '1,2'],
  ['stackTrace', 'secret stack'], ['message', 'raw exception'], ['address', 'street']
]) {
  assert.equal(validCrashReport({ ...good, [key]: value }), false, `privacy-sensitive key ${key} must be rejected`);
}
assert.equal(validCrashReport({ ...good, extra: 'x' }), false, 'unknown crash fields must be rejected');
assert.equal(validCrashReport({ ...good, exceptionSignature: 'java.lang.IllegalStateException: raw message' }), false, 'raw exception text is not a signature');
assert.equal(validCrashReport({ ...good, module: '../private/location' }), false, 'unsafe module names must be rejected');
console.log('Phase 5C crash privacy tests passed');
