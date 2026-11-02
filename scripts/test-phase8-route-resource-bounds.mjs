import fs from 'node:fs';

const wrapper = fs.readFileSync('src/worker-v5b.ts', 'utf8');
const core = fs.readFileSync('src/index.ts', 'utf8');
const location = fs.readFileSync('src/location-ingest-v6.ts', 'utf8');
const crash = fs.readFileSync('src/phase5c.ts', 'utf8');
const security = fs.readFileSync('src/device-json-security.ts', 'utf8');
const bounded = fs.readFileSync('src/bounded-body.ts', 'utf8');

function need(source, text, message) {
  if (!source.includes(text)) throw new Error(message);
}

// Shared reader must reject from Content-Length when possible and stop streaming immediately once
// an undeclared/chunked request crosses its application limit.
for (const [text, message] of [
  ['if (Number.isFinite(declared) && declared > maxBytes)', 'bounded reader must reject oversized declared bodies'],
  ['if (total > maxBytes)', 'bounded reader must stop oversized streamed bodies'],
  ['void reader.cancel()', 'bounded reader should best-effort cancel oversized streams'],
]) need(bounded, text, message);

// Parent/browser mutations: Access/session auth + exact same-origin + bounded body before forwarding.
need(wrapper, 'const MAX_PARENT_MUTATION_BYTES = 32 * 1024;', 'parent mutation body limit missing');
const forward = wrapper.indexOf('async function forwardParentMutation');
const parentAuth = wrapper.indexOf('const denied = await requireParent(req, env);', forward);
const origin = wrapper.indexOf('if (!sameOriginMutation(req)) return csrfDenied();', parentAuth);
const body = wrapper.indexOf('const bodyDenied = await parentMutationBodyDenied(req);', origin);
const dispatch = wrapper.indexOf('coreHandler.fetch(authorizeForCore(req)', body);
if (!(forward >= 0 && parentAuth > forward && origin > parentAuth && body > origin && dispatch > body)) {
  throw new Error('parent mutation must be authenticated, same-origin and body-bounded before core dispatch');
}

// Pair completion is public by design: rate-limit by edge IP before parsing, then independently
// validate a 4 KiB bounded body/public key before any pairing token can be consumed.
const pairRoute = wrapper.indexOf('u.pathname === "/api/pair/complete"');
const pairRate = wrapper.indexOf('const rateDenied = await pairingRateDenied(req, env);', pairRoute);
const pairValidate = wrapper.indexOf('const denied = await validatePairingPublicKey(req);', pairRate);
const pairCanonical = wrapper.indexOf('const canonical = await canonicalPairingRequest(req, env);', pairValidate);
if (!(pairRoute >= 0 && pairRate > pairRoute && pairValidate > pairRate && pairCanonical > pairValidate)) {
  throw new Error('pair completion must be IP-rate-limited and bounded/validated before core dispatch');
}
need(wrapper, 'readBoundedBody(req.clone(), 4096)', 'canonical pairing request must remain 4 KiB bounded');
need(security, 'readBoundedBody(req.clone(), 4096)', 'pairing public-key validation must remain 4 KiB bounded');

// Parent pair-start itself is protected by the parent wrapper body cap plus a dedicated pairing
// limiter in the core handler.
need(core, 'env.PAIR_RATE.limit({ key: "parent-pair-start" })', 'parent pair-start rate limit missing');
need(core, 'u.pathname === "/parent/api/pair/start"', 'parent pair-start route missing');

// Device location endpoints each apply a per-device rate limiter and a hard signed-body maximum.
for (const [fn, key, bodyMarker] of [
  ['ingestLocationV6', ':location`', 'signedBody(req, d.public_key_spki_b64, V2_BYTES)'],
  ['ingestLocationBatchV6', ':location-batch`', 'signedBody(req, d.public_key_spki_b64, maxBytes)'],
  ['previewLatestLocationV6', ':live-preview`', 'signedBody(req, d.public_key_spki_b64, V2_BYTES)'],
]) {
  const start = location.indexOf(`export async function ${fn}`);
  if (start < 0) throw new Error(`${fn} missing`);
  const end = location.indexOf('\nexport async function ', start + 10);
  const block = location.slice(start, end < 0 ? location.length : end);
  if (!block.includes('env.DEVICE_RATE.limit({ key:')) throw new Error(`${fn} device rate limit missing`);
  if (!block.includes(key)) throw new Error(`${fn} rate-limit namespace changed unexpectedly`);
  if (!block.includes(bodyMarker)) throw new Error(`${fn} signed body bound missing`);
}
need(location, 'const MAX_BATCH = 20;', 'location batch count bound missing');

// Health and safety are signed JSON. The outer replay validator itself uses the bounded signed-json
// helper before the request reaches the core route, and the core route has a dedicated rate key.
need(security, 'async function signedJson(req: Request, env: DeviceJsonSecurityEnv, deviceId: string, maxBytes = 8192)', 'signed JSON body cap missing');
need(core, 'env.DEVICE_RATE.limit({ key: `${id}:health` })', 'health rate limit missing');
need(core, 'verifySignedPayload(req, d, 8192)', 'health core body bound missing');
need(core, 'env.DEVICE_RATE.limit({ key: `${id}:event` })', 'safety-event rate limit missing');
const eventBounds = core.match(/verifySignedPayload\(req, d, 8192\)/g) ?? [];
if (eventBounds.length < 2) throw new Error('health and safety event must both retain 8 KiB core body bounds');

// Crash reports have their own limiter and strict 4 KiB bound.
need(crash, 'env.DEVICE_RATE.limit({ key: `${deviceId}:crash` })', 'crash-report rate limit missing');
need(crash, 'readBoundedBody(req, 4096)', 'crash-report body bound missing');

console.log('Phase 8 route resource bounds OK: parent/pair/location/health/safety/crash mutations remain rate-limited and body-bounded');
