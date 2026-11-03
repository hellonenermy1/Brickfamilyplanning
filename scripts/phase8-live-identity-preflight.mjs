import { planDeviceIdentityCanonicalization } from './phase8-identity-migration.mjs';

const API = 'https://api.cloudflare.com/client/v4';
const D1_NAME = 'brick-family-v1';
const MAX_EXISTING_DEVICES = 10_000;

async function cloudflare(token, path, init = {}) {
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

async function selectAccount(token, explicitAccount) {
  const accounts = await cloudflare(token, '/accounts?per_page=50');
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error('No Cloudflare accounts are visible to this scoped token.');
  if (explicitAccount) {
    const found = accounts.find(account => account.id === explicitAccount);
    if (!found) throw new Error('CLOUDFLARE_ACCOUNT_ID is not visible to the supplied scoped token.');
    return found.id;
  }
  if (accounts.length !== 1) throw new Error(`Token can access ${accounts.length} accounts. Set CLOUDFLARE_ACCOUNT_ID explicitly; Brick will not guess.`);
  return accounts[0].id;
}

async function queryD1(token, accountId, databaseId, sql, params = []) {
  return cloudflare(token, `/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql, params })
  });
}

function rowsFromQuery(result) {
  return Array.isArray(result?.[0]?.results) ? result[0].results : [];
}

/**
 * Before schema 015 creates its text UNIQUE index, normalize any legacy padded/unpadded Base64
 * spelling to the cryptographic P-256 SPKI canonical form. This runs only for an already-existing
 * Brick database. Fresh installs have no historical identities and continue directly to setup.
 */
export async function preflightPhase8LiveDeviceIdentities(env = process.env) {
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is required. Use a scoped API token; never commit a Global API key.');
  const explicitAccount = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const accountId = await selectAccount(token, explicitAccount);

  const databases = await cloudflare(token, `/accounts/${accountId}/d1/database?per_page=100`);
  const db = Array.isArray(databases) ? databases.find(item => item.name === D1_NAME) : null;
  if (!db?.uuid) return { accountId, status: 'fresh-install-no-existing-d1', updated: 0 };

  const tables = rowsFromQuery(await queryD1(
    token,
    accountId,
    db.uuid,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='devices'"
  ));
  if (!tables.some(row => row.name === 'devices')) {
    return { accountId, databaseId: db.uuid, status: 'fresh-install-no-devices-table', updated: 0 };
  }

  const existing = rowsFromQuery(await queryD1(
    token,
    accountId,
    db.uuid,
    `SELECT id,public_key_spki_b64 FROM devices ORDER BY id LIMIT ${MAX_EXISTING_DEVICES + 1}`
  ));
  if (existing.length > MAX_EXISTING_DEVICES) {
    throw new Error(`Phase 8 identity preflight refuses to normalize more than ${MAX_EXISTING_DEVICES} devices in one deployment`);
  }

  const updates = await planDeviceIdentityCanonicalization(existing);
  for (const update of updates) {
    const result = await queryD1(
      token,
      accountId,
      db.uuid,
      'UPDATE devices SET public_key_spki_b64=?1 WHERE id=?2 AND public_key_spki_b64=?3',
      [update.to, update.id, update.from]
    );
    const changes = Number(result?.[0]?.meta?.changes ?? 0);
    if (changes !== 1) {
      throw new Error(`device identity changed concurrently during Phase 8 preflight: ${update.id}`);
    }
  }

  // Re-read after updates. This catches concurrent enrollment and proves schema 015 will see only
  // canonical, semantically unique rows. If a race creates an exact duplicate after this point, the
  // UNIQUE migration itself still fails before worker-v9 activation.
  const verified = rowsFromQuery(await queryD1(
    token,
    accountId,
    db.uuid,
    `SELECT id,public_key_spki_b64 FROM devices ORDER BY id LIMIT ${MAX_EXISTING_DEVICES + 1}`
  ));
  if (verified.length > MAX_EXISTING_DEVICES) throw new Error('device count changed beyond Phase 8 preflight safety bound');
  const remaining = await planDeviceIdentityCanonicalization(verified);
  if (remaining.length !== 0) throw new Error('Phase 8 identity canonicalization did not converge');

  return { accountId, databaseId: db.uuid, status: 'verified', updated: updates.length };
}
