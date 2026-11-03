import fs from 'node:fs';

const pin = fs.readFileSync('src/pin-pairing.ts','utf8');
const worker = fs.readFileSync('src/worker-p8b.ts','utf8');
const schema = fs.readFileSync('schema/018_p8b_pin_pairing.sql','utf8');
const android = fs.readFileSync('app/src/main/java/com/brick/safety/network/PinPairingApi.kt','utf8');
const main = fs.readFileSync('app/src/main/java/com/brick/safety/ui/MainActivity.kt','utf8');
const parent = fs.readFileSync('src/parent-p8b.ts','utf8');

function must(condition, message){ if(!condition) throw new Error(message); }

must(pin.includes('const PIN_TTL_MS = 10 * 60_000'), 'PIN must expire after ten minutes');
must(pin.includes('const PIN_RE = /^\\d{8}$/'), 'fallback PIN must be exactly eight digits');
must(pin.includes('sha256Hex(pin)'), 'plaintext PIN must not be stored');
must(!schema.includes(' pin TEXT '), 'schema must not store plaintext PIN');
must(schema.includes('pin_hash TEXT NOT NULL UNIQUE'), 'PIN hash must be unique');
for(const col of ['claimed_at','claim_secret_hash','confirmed_at','device_id','expires_at']) must(schema.includes(col), `missing PIN session field ${col}`);

const claim = pin.slice(pin.indexOf('export async function childClaimPin'), pin.indexOf('/** Parent can inspect'));
must(claim.includes('PAIR_RATE') || claim.includes('rate(env'), 'child claim must be rate limited');
must(claim.includes('claimed_at IS NULL') && claim.includes('confirmed_at IS NULL') && claim.includes('expires_at>=?1'), 'claim must be one-shot and expiry bounded');
must(!claim.includes('INSERT INTO devices'), 'public child PIN claim must never bind/create a device');
must(claim.includes('claim_secret_hash'), 'claim must mint a high-entropy possession secret');

const confirm = pin.slice(pin.indexOf('export async function parentConfirmPin'), pin.indexOf('/** Child proves'));
must(confirm.includes('sameOrigin(req)'), 'parent confirmation must be same-origin');
must(confirm.includes('claimed_at === null'), 'parent may only confirm a claimed session');
must(confirm.includes('INSERT INTO devices'), 'device binding must happen only in parent confirmation');
must(confirm.includes('confirmed_at'), 'confirmation must be durable/idempotent');

must(worker.includes('/api/pair/pin/claim') && worker.includes('/api/pair/pin/status'), 'public claim/status routes missing');
must(worker.includes('/parent/api/pair/pin/start'), 'authenticated parent PIN start route missing');
must(worker.includes('const denied = await parentGuard(req, env)'), 'parent PIN routes must cross Access authorization');
must(worker.includes('parentConfirmPin(req, env, sessionId)'), 'parent confirmation route missing');

must(android.includes('Fallback pairing') && android.includes('/api/pair/pin/claim') && android.includes('/api/pair/pin/status'), 'Android fallback PIN client missing');
must(android.includes('claimSecret'), 'Android must poll with claim secret rather than reusable PIN');
must(main.includes('PinPairingApi.completeFallback(base, token)'), 'manual eight-digit fallback is not reachable from child setup');
must(parent.includes('Create fallback PIN') && parent.includes('Confirm claimed phone'), 'parent confirmation UI missing');
must(parent.includes('/parent/api/pair/pin/start') && parent.includes('/parent/api/pair/pin/'), 'parent PIN API wiring missing');

console.log('P8B fallback PIN pairing contract PASS');
