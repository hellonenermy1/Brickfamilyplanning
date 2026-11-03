import { readBoundedBody } from "./bounded-body";
import { canonicalDevicePublicKey } from "./crypto";

export type Phase8IdentityEnv = { DB: D1Database };
export type DeviceIdentityRow = Record<string, unknown> & {
  id?: unknown;
  public_key_spki_b64?: unknown;
};

const MAX_PAIRING_BODY = 4096;

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
 * upgrade edge where a historical row used a different Base64-padding spelling of the same DER SPKI.
 *
 * The public pairing route is unauthenticated, so this lookup must remain O(1) with respect to the
 * number of registered devices. Candidate rows are selected by the only historical alias Brick needs
 * to support (trailing Base64 padding), then cryptographically canonicalized before comparison. New or
 * malformed requests continue to the normal bounded, rate-limited pairing path.
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

  // A text UNIQUE index cannot collapse padded/unpadded legacy spellings. Restrict the pre-rate-limit
  // compatibility check to matching padding aliases instead of scanning the device registry.
  const result = await env.DB.prepare(
    "SELECT id,public_key_spki_b64 FROM devices WHERE public_key_spki_b64=?1 OR RTRIM(public_key_spki_b64,'=')=RTRIM(?1,'=') LIMIT 4"
  ).bind(canonical).all<{ id: string; public_key_spki_b64: string }>();
  if (!result.results.length) return null;

  let rows: DeviceIdentityRow[];
  try { rows = await canonicalizeHistoricalDeviceRows(result.results); }
  catch {
    // Multiple textual aliases for one key, or an invalid matching historical row, is an integrity
    // issue that should be repaired rather than made worse by another enrollment.
    return json({ error: "stored device identity requires administrative repair before pairing" }, 503);
  }
  if (rows.some(row => row.public_key_spki_b64 === canonical)) {
    return json({ error: "device identity already registered" }, 409);
  }
  return null;
}
