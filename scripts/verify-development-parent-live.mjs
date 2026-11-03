import fs from 'node:fs/promises';
import https from 'node:https';
import { createHash, randomBytes } from 'node:crypto';

const API = 'https://api.cloudflare.com/client/v4';
const D1_NAME = 'brick-family-v1-dev';
const token = process.env.CLOUDFLARE_API_TOKEN;
const explicitAccount = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required.');

async function cf(path, init = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new Error(`Cloudflare API ${response.status} for ${path}: ${JSON.stringify(body.errors || body)}`);
  }
  return body.result;
}

async function selectAccount() {
  const accounts = await cf('/accounts?per_page=50');
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('No Cloudflare account is visible to the token.');
  if (explicitAccount) {
    const found = accounts.find(a => a.id === explicitAccount);
    if (!found) throw new Error('Requested Cloudflare account is not visible to the token.');
    return found.id;
  }
  if (accounts.length !== 1) throw new Error(`Token can access ${accounts.length} accounts. Set CLOUDFLARE_ACCOUNT_ID explicitly.`);
  return accounts[0].id;
}

async function readOrigin() {
  const explicit = process.env.BRICK_DEV_PARENT_ORIGIN?.trim();
  if (explicit) return new URL(explicit).origin;
  const state = JSON.parse(await fs.readFile('setup-development-state.json', 'utf8'));
  if (!state?.workerHost) throw new Error('Development worker host missing from setup-development-state.json.');
  return `https://${state.workerHost}`;
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function jsonRequest(origin, path, session) {
  const response = await fetch(origin + path, {
    headers: { Cookie: `brick_parent_dev=${session}`, Accept: 'application/json' },
    redirect: 'manual'
  });
  const contentType = response.headers.get('content-type') || '';
  if (response.status !== 200 || !contentType.toLowerCase().includes('application/json')) {
    const body = (await response.text()).slice(0, 240).replace(/\s+/g, ' ');
    throw new Error(`${path} expected 200 JSON, got ${response.status} ${contentType}: ${body}`);
  }
  return response.json();
}

function verifyWebSocket(origin, deviceId, session) {
  return new Promise((resolve, reject) => {
    const u = new URL(origin);
    const key = randomBytes(16).toString('base64');
    const req = https.request({
      protocol: 'https:',
      hostname: u.hostname,
      port: u.port || 443,
      path: `/parent/api/device/${encodeURIComponent(deviceId)}/ws`,
      method: 'GET',
      headers: {
        Host: u.host,
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key,
        Origin: origin,
        Cookie: `brick_parent_dev=${session}`
      }
    });
    const timer = setTimeout(() => {
      req.destroy(new Error('parent WebSocket smoke timed out'));
    }, 10_000);
    req.on('upgrade', (response, socket) => {
      clearTimeout(timer);
      if (response.statusCode !== 101) {
        socket.destroy();
        reject(new Error(`parent WebSocket expected 101, got ${response.statusCode}`));
        return;
      }
      socket.destroy();
      resolve();
    });
    req.on('response', response => {
      clearTimeout(timer);
      response.resume();
      reject(new Error(`parent WebSocket upgrade rejected with HTTP ${response.statusCode}`));
    });
    req.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    req.end();
  });
}

const accountId = await selectAccount();
const databases = await cf(`/accounts/${accountId}/d1/database?per_page=100`);
const db = Array.isArray(databases) ? databases.find(x => x.name === D1_NAME) : null;
if (!db?.uuid) throw new Error(`${D1_NAME} D1 database not found.`);

async function d1Query(sql, params = []) {
  return cf(`/accounts/${accountId}/d1/database/${db.uuid}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql, params })
  });
}

const origin = await readOrigin();
const session = randomBytes(32).toString('base64url');
const sessionHash = sha256Hex(session);
const now = Date.now();
await d1Query(
  'INSERT INTO dev_parent_sessions(session_hash,created_at,expires_at,revoked_at) VALUES(?1,?2,?3,NULL)',
  [sessionHash, now, now + 5 * 60_000]
);

try {
  const deviceList = await jsonRequest(origin, '/parent/api/devices', session);
  if (!Array.isArray(deviceList?.devices)) throw new Error('parent devices response has no devices array');
  console.log(`Authenticated parent devices API PASS (${deviceList.devices.length} device record(s)).`);

  const active = deviceList.devices.find(device => device && device.revoked_at == null && typeof device.id === 'string');
  if (!active) {
    console.log('No active paired device; device-specific state/WebSocket smoke skipped.');
  } else {
    const state = await jsonRequest(origin, `/parent/api/device/${encodeURIComponent(active.id)}/state`, session);
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('parent current-state response is not an object');
    console.log('Authenticated parent current-state API PASS.');
    await verifyWebSocket(origin, active.id, session);
    console.log('Authenticated parent WebSocket upgrade PASS.');
  }
} finally {
  await d1Query('DELETE FROM dev_parent_sessions WHERE session_hash=?1', [sessionHash]).catch(() => {});
}
