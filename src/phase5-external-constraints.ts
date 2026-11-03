const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WITNESS_MAX_AGE_MS = 120_000;
const GROUND_MAX_AGE_MS = 180_000;
const MAX_ROWS = 64;
const MAX_OUTPUT = 16;

export type ExternalConstraint = {
  id: string;
  kind: "witness" | "ground_receiver";
  independenceGroup: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  observedWallMs: number;
  ageMs: number;
  sourceId: string;
  explanation: string;
};

type WitnessRow = {
  record_id: string;
  witness_device_id: string;
  observed_wall_ms: number;
  witness_latitude: number;
  witness_longitude: number;
  uncertainty_m: number;
};

type GroundRow = {
  receiver_id: string;
  sighting_id: string;
  observed_wall_ms: number;
  receiver_latitude: number;
  receiver_longitude: number;
  uncertainty_m: number;
};

function validPoint(lat: number, lon: number, radiusM: number) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lon) && lon >= -180 && lon <= 180 &&
    Number.isFinite(radiusM) && radiusM >= 25 && radiusM <= 10_000;
}

function validTime(observedWallMs: number, now: number, maxAgeMs: number) {
  return Number.isSafeInteger(observedWallMs) && observedWallMs > 0 &&
    observedWallMs <= now + 30_000 && now - observedWallMs >= -30_000 && now - observedWallMs <= maxAgeMs;
}

/**
 * Return only fresh, currently-authorised/resolved external constraints for a child. The newest
 * sighting from each witness/receiver is retained; repeated reports from the same physical source
 * do not multiply confidence as independent evidence.
 *
 * Authorization is re-checked at read time, not trusted from the historical sighting row alone.
 * Revoking a witness or disabling a receiver therefore stops its influence immediately even if a
 * still-fresh sighting was stored while it was authorised.
 */
export async function listCurrentExternalConstraints(
  db: D1Database,
  childDeviceId: string,
  now: number
): Promise<ExternalConstraint[]> {
  if (!DEVICE_ID_RE.test(childDeviceId)) throw new Error("invalid child device id");
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("invalid constraint time");

  const witness = await db.prepare(
    "SELECT s.record_id,s.witness_device_id,s.observed_wall_ms,s.witness_latitude,s.witness_longitude,s.uncertainty_m " +
    "FROM witness_sightings s WHERE s.child_device_id=?1 AND s.authorised=1 AND s.observed_wall_ms>=?2 " +
    "AND EXISTS(SELECT 1 FROM witness_authorizations a WHERE a.device_id=?1 AND a.witness_device_id=s.witness_device_id AND a.enabled=1) " +
    "ORDER BY s.observed_wall_ms DESC,s.record_id DESC LIMIT ?3"
  ).bind(childDeviceId, now - WITNESS_MAX_AGE_MS, MAX_ROWS).all<WitnessRow>();

  const ground = await db.prepare(
    "SELECT s.receiver_id,s.sighting_id,s.observed_wall_ms,s.receiver_latitude,s.receiver_longitude,s.uncertainty_m " +
    "FROM ground_sightings s WHERE s.child_device_id=?1 AND s.resolved=1 AND s.observed_wall_ms>=?2 " +
    "AND EXISTS(SELECT 1 FROM ground_receivers g WHERE g.id=s.receiver_id AND g.device_id=?1 AND g.enabled=1) " +
    "ORDER BY s.observed_wall_ms DESC,s.receiver_id,s.sighting_id DESC LIMIT ?3"
  ).bind(childDeviceId, now - GROUND_MAX_AGE_MS, MAX_ROWS).all<GroundRow>();

  const out: ExternalConstraint[] = [];
  const used = new Set<string>();

  for (const row of witness.results ?? []) {
    const group = `witness:${row.witness_device_id}`;
    if (used.has(group)) continue;
    if (!DEVICE_ID_RE.test(row.witness_device_id)) continue;
    if (!validTime(row.observed_wall_ms, now, WITNESS_MAX_AGE_MS)) continue;
    if (!validPoint(row.witness_latitude, row.witness_longitude, row.uncertainty_m)) continue;
    used.add(group);
    out.push({
      id: `witness:${row.record_id}`,
      kind: "witness",
      independenceGroup: group,
      latitude: row.witness_latitude,
      longitude: row.witness_longitude,
      radiusM: row.uncertainty_m,
      observedWallMs: row.observed_wall_ms,
      ageMs: Math.max(0, now - row.observed_wall_ms),
      sourceId: row.witness_device_id,
      explanation: "authorised Brick witness area"
    });
    if (out.length >= MAX_OUTPUT) return out;
  }

  for (const row of ground.results ?? []) {
    const group = `ground:${row.receiver_id}`;
    if (used.has(group)) continue;
    if (typeof row.receiver_id !== "string" || !/^[A-Za-z0-9._:-]{1,96}$/.test(row.receiver_id)) continue;
    if (!validTime(row.observed_wall_ms, now, GROUND_MAX_AGE_MS)) continue;
    if (!validPoint(row.receiver_latitude, row.receiver_longitude, row.uncertainty_m)) continue;
    used.add(group);
    out.push({
      id: `ground:${row.receiver_id}:${row.sighting_id}`,
      kind: "ground_receiver",
      independenceGroup: group,
      latitude: row.receiver_latitude,
      longitude: row.receiver_longitude,
      radiusM: row.uncertainty_m,
      observedWallMs: row.observed_wall_ms,
      ageMs: Math.max(0, now - row.observed_wall_ms),
      sourceId: row.receiver_id,
      explanation: "authorised fixed Brick receiver area"
    });
    if (out.length >= MAX_OUTPUT) break;
  }

  return out;
}
