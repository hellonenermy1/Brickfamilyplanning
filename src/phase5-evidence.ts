import type { EvidenceRecord } from "./evidence-protocol";

const WITNESS_PROVIDER = 17;
const WITNESS_FAMILY = 12;
export const WITNESS_SLOT_MS = 5 * 60_000;
const BACKLOG_WINDOW_MS = 14 * 24 * 60 * 60_000;
const ALIAS_RETENTION_AFTER_SLOT_MS = 14 * 24 * 60 * 60_000;
const SIGHTING_INDEX_RETENTION_MS = 30 * 24 * 60 * 60_000;
export const WITNESS_CLOCK_GRACE_MS = 2 * 60_000;
const CLEANUP_LIMIT = 200;
export const WITNESS_ALIAS_RE = /^[0-9a-f]{16}$/;

type AliasRow = { child_device_id: string; slot: number };
type AuthorizationRow = { enabled: number };

type AliasEntry = { a: string; s: number };
type AliasPayload = { v: 1; t: "a"; aliases: AliasEntry[] };
type SightingPayload = {
  v: 1;
  t: "s";
  a: string;
  latE7: number;
  lonE7: number;
  accCm: number;
  r: number;
  tx?: number | null;
};

export class Phase5SemanticError extends Error {}

function decodeJson(record: EvidenceRecord): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(record.payload));
  } catch {
    throw new Phase5SemanticError("invalid Phase 5 witness JSON");
  }
}

function isInt(n: unknown): n is number { return typeof n === "number" && Number.isSafeInteger(n); }
function isObject(x: unknown): x is Record<string, unknown> { return Boolean(x) && typeof x === "object" && !Array.isArray(x); }

function parseAliasPayload(value: unknown): AliasPayload | null {
  if (!isObject(value) || value.v !== 1 || value.t !== "a" || !Array.isArray(value.aliases)) return null;
  if (value.aliases.length < 1 || value.aliases.length > 24) throw new Phase5SemanticError("invalid witness alias count");
  const aliases: AliasEntry[] = [];
  const seen = new Set<string>();
  const seenSlots = new Set<number>();
  for (const item of value.aliases) {
    if (!isObject(item) || typeof item.a !== "string" || !WITNESS_ALIAS_RE.test(item.a) || !isInt(item.s) || item.s < 0) {
      throw new Phase5SemanticError("invalid witness alias entry");
    }
    if (seen.has(item.a)) throw new Phase5SemanticError("duplicate witness alias");
    if (seenSlots.has(item.s)) throw new Phase5SemanticError("duplicate witness alias slot");
    seen.add(item.a);
    seenSlots.add(item.s);
    aliases.push({ a: item.a, s: item.s });
  }
  return { v: 1, t: "a", aliases };
}

function parseSightingPayload(value: unknown): SightingPayload | null {
  if (!isObject(value) || value.v !== 1 || value.t !== "s") return null;
  if (typeof value.a !== "string" || !WITNESS_ALIAS_RE.test(value.a)) throw new Phase5SemanticError("invalid witness sighting alias");
  if (!isInt(value.latE7) || value.latE7 < -900_000_000 || value.latE7 > 900_000_000) throw new Phase5SemanticError("invalid witness latitude");
  if (!isInt(value.lonE7) || value.lonE7 < -1_800_000_000 || value.lonE7 > 1_800_000_000) throw new Phase5SemanticError("invalid witness longitude");
  if (!isInt(value.accCm) || value.accCm < 0 || value.accCm > 25_000) throw new Phase5SemanticError("invalid witness accuracy");
  if (!isInt(value.r) || value.r < -127 || value.r > 20) throw new Phase5SemanticError("invalid witness RSSI");
  if (value.tx !== undefined && value.tx !== null && (!isInt(value.tx) || value.tx < -127 || value.tx > 20)) {
    throw new Phase5SemanticError("invalid witness tx power");
  }
  return {
    v: 1,
    t: "s",
    a: value.a,
    latE7: value.latE7,
    lonE7: value.lonE7,
    accCm: value.accCm,
    r: value.r,
    tx: value.tx as number | null | undefined
  };
}

/** RSSI changes only a conservative allowance; it is never converted to an estimated exact range. */
export function conservativeBleAllowanceM(rssi: number | null): number {
  if (rssi === null) return 150;
  if (rssi >= -55) return 35;
  if (rssi >= -70) return 75;
  if (rssi >= -85) return 150;
  return 250;
}

function validateRecordTime(record: EvidenceRecord, now: number) {
  if (record.wallTimeMs > now + 5 * 60_000 || record.wallTimeMs < now - BACKLOG_WINDOW_MS) {
    throw new Phase5SemanticError("witness evidence outside durable semantic window");
  }
}

/**
 * Raw BREV retention remains governed by the Phase 2 R2 lifecycle. These statements bound only the
 * fast semantic indexes containing rotating aliases and derived sighting constraints.
 */
export function phase5CleanupStatements(db: D1Database, now: number, limit = CLEANUP_LIMIT): D1PreparedStatement[] {
  const sightingCutoff = now - SIGHTING_INDEX_RETENTION_MS;
  const bounded = Math.max(1, Math.min(500, Math.trunc(limit)));
  return [
    db.prepare(
      "DELETE FROM witness_aliases WHERE alias IN (" +
      "SELECT alias FROM witness_aliases WHERE expires_at<?1 ORDER BY expires_at LIMIT ?2)"
    ).bind(now, bounded),
    db.prepare(
      "DELETE FROM witness_sightings WHERE record_id IN (" +
      "SELECT record_id FROM witness_sightings WHERE received_at<?1 ORDER BY received_at LIMIT ?2)"
    ).bind(sightingCutoff, bounded),
    db.prepare(
      "DELETE FROM ground_sightings WHERE rowid IN (" +
      "SELECT rowid FROM ground_sightings WHERE received_at<?1 ORDER BY received_at LIMIT ?2)"
    ).bind(sightingCutoff, bounded)
  ];
}

async function aliasStatements(db: D1Database, uploaderDeviceId: string, record: EvidenceRecord, payload: AliasPayload, now: number) {
  validateRecordTime(record, now);
  const recordSlot = Math.floor(record.wallTimeMs / WITNESS_SLOT_MS);
  const out: D1PreparedStatement[] = [];
  for (const item of payload.aliases) {
    // Android currently publishes previous slot through +24 future slots. Leave a little clock/upgrade
    // room, but reject arbitrary far-future alias claims that could become long-lived public IDs.
    if (item.s < recordSlot - 2 || item.s > recordSlot + 36) throw new Phase5SemanticError("witness alias slot outside permitted window");
    const existing = await db.prepare(
      "SELECT child_device_id,slot FROM witness_aliases WHERE alias=?1 OR (child_device_id=?2 AND slot=?3) LIMIT 1"
    ).bind(item.a, uploaderDeviceId, item.s).first<AliasRow>();
    if (existing && (existing.child_device_id !== uploaderDeviceId || existing.slot !== item.s)) {
      throw new Phase5SemanticError("witness alias identity collision");
    }
    const validFrom = item.s * WITNESS_SLOT_MS;
    const validTo = validFrom + WITNESS_SLOT_MS;
    if (!Number.isSafeInteger(validFrom) || !Number.isSafeInteger(validTo)) throw new Phase5SemanticError("witness alias time overflow");
    const expiresAt = validTo + ALIAS_RETENTION_AFTER_SLOT_MS;
    out.push(
      db.prepare(
        "INSERT OR IGNORE INTO witness_aliases(alias,child_device_id,slot,valid_from_ms,valid_to_ms,source_record_id,created_at,expires_at) " +
        "VALUES(?1,?2,?3,?4,?5,?6,?7,?8)"
      ).bind(item.a, uploaderDeviceId, item.s, validFrom, validTo, record.recordId, now, expiresAt)
    );
    // A witness may upload first while the child is offline. Resolve later only when the reporter is
    // explicitly authorised for this child and the sighting falls in this alias slot.
    out.push(
      db.prepare(
        "UPDATE witness_sightings SET child_device_id=?1,authorised=1 " +
        "WHERE alias=?2 AND child_device_id IS NULL AND observed_wall_ms BETWEEN ?3 AND ?4 " +
        "AND witness_device_id<>?1 AND EXISTS(" +
        "SELECT 1 FROM witness_authorizations a WHERE a.device_id=?1 AND a.witness_device_id=witness_sightings.witness_device_id AND a.enabled=1)"
      ).bind(uploaderDeviceId, item.a, validFrom - WITNESS_CLOCK_GRACE_MS, validTo + WITNESS_CLOCK_GRACE_MS)
    );
    // Fixed receivers are pre-bound to a child. Ground observations can also arrive first while the
    // child is offline, so resolve them later only if that receiver remains enabled for this child.
    out.push(
      db.prepare(
        "UPDATE ground_sightings SET child_device_id=?1,resolved=1 " +
        "WHERE alias=?2 AND child_device_id IS NULL AND observed_wall_ms BETWEEN ?3 AND ?4 " +
        "AND EXISTS(SELECT 1 FROM ground_receivers g WHERE g.id=ground_sightings.receiver_id AND g.device_id=?1 AND g.enabled=1)"
      ).bind(uploaderDeviceId, item.a, validFrom - WITNESS_CLOCK_GRACE_MS, validTo + WITNESS_CLOCK_GRACE_MS)
    );
  }
  out.push(...phase5CleanupStatements(db, now));
  return out;
}

async function sightingStatements(db: D1Database, witnessDeviceId: string, record: EvidenceRecord, payload: SightingPayload, now: number) {
  validateRecordTime(record, now);
  const latitude = payload.latE7 / 10_000_000;
  const longitude = payload.lonE7 / 10_000_000;
  const witnessAccuracyM = payload.accCm / 100;
  const allowance = conservativeBleAllowanceM(payload.r);
  const uncertainty = Math.min(5_000, Math.max(35, witnessAccuracyM + allowance));

  const alias = await db.prepare(
    "SELECT child_device_id,slot FROM witness_aliases WHERE alias=?1 AND ?2 BETWEEN valid_from_ms-?3 AND valid_to_ms+?3 LIMIT 1"
  ).bind(payload.a, record.wallTimeMs, WITNESS_CLOCK_GRACE_MS).first<AliasRow>();

  let childDeviceId: string | null = null;
  let authorised = 0;
  if (alias && alias.child_device_id !== witnessDeviceId) {
    const auth = await db.prepare(
      "SELECT enabled FROM witness_authorizations WHERE device_id=?1 AND witness_device_id=?2 LIMIT 1"
    ).bind(alias.child_device_id, witnessDeviceId).first<AuthorizationRow>();
    if (auth?.enabled === 1) {
      childDeviceId = alias.child_device_id;
      authorised = 1;
    }
  }

  const out = [
    db.prepare(
      "INSERT OR IGNORE INTO witness_sightings(record_id,alias,witness_device_id,child_device_id,observed_wall_ms," +
      "witness_latitude,witness_longitude,witness_accuracy_m,rssi,tx_power,proximity_allowance_m,uncertainty_m,authorised,received_at) " +
      "VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)"
    ).bind(
      record.recordId, payload.a, witnessDeviceId, childDeviceId, record.wallTimeMs,
      latitude, longitude, witnessAccuracyM, payload.r, payload.tx ?? null,
      allowance, uncertainty, authorised, now
    )
  ];
  out.push(...phase5CleanupStatements(db, now));
  return out;
}

/**
 * Produce D1 side effects for a newly persisted Phase 5 evidence record. Raw evidence remains the
 * durable source of truth in R2; these tables are bounded indexes/constraints for fast fusion use.
 */
export async function phase5EvidenceStatements(db: D1Database, uploaderDeviceId: string, record: EvidenceRecord, now: number): Promise<D1PreparedStatement[]> {
  if (record.provider !== WITNESS_PROVIDER) return [];
  if (record.family !== WITNESS_FAMILY) throw new Phase5SemanticError("witness provider/family mismatch");
  const decoded = decodeJson(record);
  const alias = parseAliasPayload(decoded);
  if (alias) return aliasStatements(db, uploaderDeviceId, record, alias, now);
  const sighting = parseSightingPayload(decoded);
  if (sighting) return sightingStatements(db, uploaderDeviceId, record, sighting, now);
  throw new Phase5SemanticError("unknown witness evidence type");
}
