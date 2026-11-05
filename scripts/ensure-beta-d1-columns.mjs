import {BETA_COMPAT_COLUMNS} from './beta-compat-columns.mjs';
const API = 'https://api.cloudflare.com/client/v4';
const D1_NAME = 'brick-family-beta';

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

async function tableExists(table) {
  const result = await d1Query("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?1 LIMIT 1", [table]);
  return result?.[0]?.results?.[0]?.ok === 1;
}

async function ensureColumns(table, columns) {
  if (!(await tableExists(table))) return [];
  const result = await d1Query(`PRAGMA table_info(${table})`);
  const existing = new Set((result?.[0]?.results || []).map(row => row.name));
  const added = [];
  for (const [name, type] of columns) {
    if (existing.has(name)) continue;
    await d1Query(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    added.push(`${table}.${name}`);
  }
  return added;
}

const added = [];
for(const [table, columns] of Object.entries(BETA_COMPAT_COLUMNS)) added.push(...await ensureColumns(table, columns));

const verify = await d1Query('PRAGMA table_info(devices)');
const deviceColumns = new Set((verify?.[0]?.results || []).map(row => row.name));
for (const required of ['last_health_at','health_status','recovery_count','pending_records','app_version']) {
  if (!deviceColumns.has(required)) throw new Error(`Required development devices column still missing: ${required}`);
}

console.log(added.length ? `Development D1 compatibility columns added: ${added.join(', ')}` : 'Development D1 compatibility columns already present.');
