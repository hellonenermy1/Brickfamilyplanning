import { readBoundedBody } from "./bounded-body";
import { canonicalDevicePublicKey } from "./crypto";

export type Phase8IdentityEnv = { DB: D1Database };
export type DeviceIdentityRow = Record<string, unknown> & {
  id?: unknown;
  public_key_spki_b64?: unknown;
};

const MAX_PAIRING_BODY = 4096;
const MAX_DEVICE_IDENTITIES = 1000;

function json(data: unknown, status: number) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

/**
 * Normalize historical/backup device rows to the exact padded Base64 representation used by Phase 8.
 * The UNIQUE D1 index is text-based; canonicalizing before restore prevents two textual spellings of
 * one P-256 SPKI from becoming two device identities. Invalid historical keys fail closed because
 * silently keeping an identity the current verifier cannot understand would make recovery ambiguous.
 */
export async function canonicalizeHistoricalDeviceRows(rows: DeviceIdentityRow[]): Promise<DeviceIdentityRow[]> {
  const seen = new Map<string, string>();
  const out: DeviceIdentityRow[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" && row.id ? row.id : "unknown-device";
    const supplied = row.public_key_spki_b64;
    if (typeof supplied !== "string") throw new Error(`device ${id} has no stored public key`);
    const canonical = await canonicalDevicePublicKey(supplied);
    if (!canonical) throw new Error(`device ${id} has an invalid stored P-256 public key`);
    const previous = seen.get(canonical);
    if (previous && previous !== id) {
      throw new Error(`semantic duplicate device identity: ${previous} and ${id} use the same P-256 key`);
    }
    seen.set(canonical, id);
    out.push({ ...row, public_key_spki_b64: canonical });
  }
  return out;
}

/**
 * Extra Phase 8 pairing guard for pre-canonicalization databases. New registrations are already
 * canonicalized by worker-v5b and protected by schema 015's UNIQUE index. This guard closes the
 * upgrade edge where a historical row used an unpadded spelling of the same DER SPKI: compare the
 * cryptographic identity, not only the stored text, before any new enrollment can reach the base
 * pairing handler. It intentionally does not consume or validate a pairing token; malformed/new
 * requests continue to the normal bounded, rate-limited pairing path.
 */
export async function historicalIdentityPairingDenied(req: Request, env: Phase8IdentityEnv): Promise<Response | null> {
  const bounded = await readBoundedBody(req.clone(), MAX_PAIRING_BODY);
  if (!bounded.ok || !bounded.body.byteLength) return null;
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bounded.body)); }
  catch { return null; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const supplied = (body as Record<string, unknown>).publicKeySpkiB64;
  if (typeof supplied !== "string") return null;
  const canonical = await canonicalDevicePublicKey(supplied);
  if (!canonical) return null;

  const result = await env.DB.prepare(
    "SELECT id,public_key_spki_b64 FROM devices ORDER BY created_at LIMIT ?1"
  ).bind(MAX_DEVICE_IDENTITIES + 1).all<{ id: string; public_key_spki_b64: string }>();
  if (result.results.length > MAX_DEVICE_IDENTITIES) {
    return json({ error: "device identity registry requires administrative review before pairing" }, 503);
  }

  let rows: DeviceIdentityRow[];
  try { rows = await canonicalizeHistoricalDeviceRows(result.results); }
  catch {
    // Fail closed: an invalid or semantically duplicated historical identity must be repaired before
    // another key can be enrolled, otherwise Phase 8's permanent tombstone guarantee is ambiguous.
    return json({ error: "stored device identity requires administrative repair before pairing" }, 503);
  }
  if (rows.some(row => row.public_key_spki_b64 === canonical)) {
    return json({ error: "device identity already registered" }, 409);
  }
  return null;
}
