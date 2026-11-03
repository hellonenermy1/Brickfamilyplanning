import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function strictBase64Bytes(value) {
  if (typeof value !== 'string' || value.length < 16 || value.length > 4096) throw new Error('stored device public key is missing or unreasonably sized');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('stored device public key is not standard Base64');
  const unpadded = value.replace(/=+$/, '');
  if (unpadded.length % 4 === 1) throw new Error('stored device public key has invalid Base64 length');
  const padded = unpadded + '='.repeat((4 - (unpadded.length % 4)) % 4);
  const bytes = Buffer.from(padded, 'base64');
  if (!bytes.length || bytes.toString('base64').replace(/=+$/, '') !== unpadded) throw new Error('stored device public key has invalid Base64 encoding');
  return bytes;
}

export async function canonicalStoredP256Spki(value) {
  const bytes = strictBase64Bytes(value);
  let key;
  try {
    key = await crypto.subtle.importKey(
      'spki',
      bytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify']
    );
  } catch {
    throw new Error('stored device public key is not a valid P-256 SPKI');
  }
  const exported = await crypto.subtle.exportKey('spki', key);
  return Buffer.from(exported).toString('base64');
}

/**
 * Plan an idempotent live-upgrade normalization before schema 015 creates its text UNIQUE index.
 * Any two rows that decode to one P-256 key are an ambiguous device identity and must stop the
 * deployment before worker-v9 activation. A single legacy unpadded spelling is safe to rewrite to
 * the canonical padded Base64 form used by current Android pairing.
 */
export async function planDeviceIdentityCanonicalization(rows) {
  if (!Array.isArray(rows)) throw new Error('device identity rows are not an array');
  const seen = new Map();
  const updates = [];
  for (const row of rows) {
    const id = typeof row?.id === 'string' && row.id ? row.id : null;
    const stored = typeof row?.public_key_spki_b64 === 'string' ? row.public_key_spki_b64 : null;
    if (!id || !stored) throw new Error('device identity row is missing id/public key');
    const canonical = await canonicalStoredP256Spki(stored);
    const previous = seen.get(canonical);
    if (previous && previous !== id) {
      throw new Error(`semantic duplicate device identity: ${previous} and ${id} use the same P-256 key`);
    }
    seen.set(canonical, id);
    if (canonical !== stored) updates.push({ id, from: stored, to: canonical });
  }
  return updates;
}
