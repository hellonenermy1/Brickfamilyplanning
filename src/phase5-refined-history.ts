import type { EvidenceRecord } from "./evidence-protocol";
import type { LivePacket } from "./protocol";
import { refineHypothesisInterval, validateSmoothingFrame, type SmoothingEndpoint, type SmoothingFrame, type StoredHypothesis } from "./phase5-smoothing";

const FUSION_HYPOTHESES_PROVIDER = 22;
const POSITION_FAMILY = 1;
const FRAME_RETENTION_MS = 30 * 86_400_000;
const REFINED_RETENTION_MS = 90 * 86_400_000;
const MAX_SMOOTHING_INTERVAL_MS = 24 * 60 * 60_000;
const MAX_UNREFINED_FRAMES = 100;
const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;

type RefinementEnv = { DB: D1Database; HISTORY: R2Bucket };
type FrameRow = { record_id: string; wall_time_ms: number; r2_key: string };
type EndpointRow = {
  epoch: number;
  sequence: number;
  wall_time_ms: number;
  latitude: number;
  longitude: number;
  uncertainty_m: number;
};
type IntervalRow = {
  id: string;
  from_ms: number;
  to_ms: number;
  model_version: string;
  refined_r2_key: string | null;
  created_at: number;
};

type WireHypothesis = {
  id: string;
  latE7: number;
  lonE7: number;
  uCm: number;
  rw: number;
  ew: number;
  s: string;
};
type WireFrame = { v: 1; t: "h"; o: string; m: number; h: WireHypothesis[] };
type StoredFrameObject = {
  v: 1;
  recordId: string;
  wallTimeMs: number;
  originalRealtimeHypothesisId: string;
  maxSpeedMps: number;
  hypotheses: StoredHypothesis[];
};

type RefinedRunObject = {
  v: 1;
  runId: string;
  modelVersion: "phase5-smoothing-v1";
  fromMs: number;
  toMs: number;
  createdAt: number;
  frames: ReturnType<typeof refineHypothesisInterval>;
};

export class Phase5RefinedHistoryError extends Error {}

function safeDevice(deviceId: string) { return deviceId.replace(/[^A-Za-z0-9_-]/g, "_"); }
function day(ms: number) { return new Date(ms).toISOString().slice(0, 10); }
function isObject(x: unknown): x is Record<string, unknown> { return Boolean(x) && typeof x === "object" && !Array.isArray(x); }
function isInt(x: unknown): x is number { return typeof x === "number" && Number.isSafeInteger(x); }

function parseHypothesisFrame(record: EvidenceRecord): StoredFrameObject | null {
  if (record.provider !== FUSION_HYPOTHESES_PROVIDER) return null;
  if (record.family !== POSITION_FAMILY || record.independenceGroup !== "fusion.hypotheses") {
    throw new Phase5RefinedHistoryError("fusion hypothesis provider/family mismatch");
  }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(record.payload)); }
  catch { throw new Phase5RefinedHistoryError("invalid fusion hypothesis JSON"); }
  if (!isObject(value) || value.v !== 1 || value.t !== "h" || typeof value.o !== "string" || !ID_RE.test(value.o) ||
      !isInt(value.m) || value.m < 1 || value.m > 120 || !Array.isArray(value.h) || value.h.length < 1 || value.h.length > 10) {
    throw new Phase5RefinedHistoryError("invalid fusion hypothesis frame");
  }
  const seen = new Set<string>();
  const hypotheses: StoredHypothesis[] = [];
  for (const item of value.h) {
    if (!isObject(item) || typeof item.id !== "string" || !ID_RE.test(item.id) || seen.has(item.id) ||
        !isInt(item.latE7) || item.latE7 < -900_000_000 || item.latE7 > 900_000_000 ||
        !isInt(item.lonE7) || item.lonE7 < -1_800_000_000 || item.lonE7 > 1_800_000_000 ||
        !isInt(item.uCm) || item.uCm < 100 || item.uCm > 5_000_000 ||
        !isInt(item.rw) || item.rw < 0 || item.rw > 1_000 ||
        !isInt(item.ew) || item.ew < 0 || item.ew > 1_000 ||
        typeof item.s !== "string" || item.s.length < 1 || item.s.length > 48) {
      throw new Phase5RefinedHistoryError("invalid fusion hypothesis entry");
    }
    seen.add(item.id);
    hypotheses.push({
      id: item.id,
      latitude: item.latE7 / 10_000_000,
      longitude: item.lonE7 / 10_000_000,
      uncertaintyM: item.uCm / 100,
      realtimeWeight: item.rw / 1_000,
      storedEvidenceWeight: item.ew / 1_000,
      source: item.s
    });
  }
  if (!seen.has(value.o)) throw new Phase5RefinedHistoryError("original hypothesis missing from frame");
  return {
    v: 1,
    recordId: record.recordId,
    wallTimeMs: record.wallTimeMs,
    originalRealtimeHypothesisId: value.o,
    maxSpeedMps: value.m,
    hypotheses
  };
}

/**
 * Called only after the signed raw BREV batch is durable. The normalized smoothing frame is stored
 * separately so later refinement never has to mutate or reinterpret the raw evidence object.
 */
export async function persistHypothesisFrameIfPresent(env: RefinementEnv, deviceId: string, record: EvidenceRecord, now: number) {
  const frame = parseHypothesisFrame(record);
  if (!frame) return false;
  if (record.wallTimeMs < now - FRAME_RETENTION_MS || record.wallTimeMs > now + 5 * 60_000) {
    throw new Phase5RefinedHistoryError("fusion hypothesis frame outside retention window");
  }
  const key = `history/hypotheses/${safeDevice(deviceId)}/${day(record.wallTimeMs)}/${record.recordId}.json`;
  const existing = await env.DB.prepare(
    "SELECT r2_key,wall_time_ms FROM phase5_hypothesis_frames WHERE device_id=?1 AND record_id=?2"
  ).bind(deviceId, record.recordId).first<{ r2_key: string; wall_time_ms: number }>();
  if (existing) {
    if (existing.r2_key !== key || existing.wall_time_ms !== record.wallTimeMs) {
      throw new Phase5RefinedHistoryError("fusion hypothesis frame identity collision");
    }
    return true;
  }
  await env.HISTORY.put(key, JSON.stringify(frame), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { kind: "phase5-hypothesis-frame", recordId: record.recordId }
  });
  await env.DB.prepare(
    "INSERT INTO phase5_hypothesis_frames(device_id,record_id,wall_time_ms,r2_key,created_at,refined_run_id) VALUES(?1,?2,?3,?4,?5,NULL)"
  ).bind(deviceId, record.recordId, record.wallTimeMs, key, now).run();
  return true;
}

export function preciseEndpointStatements(db: D1Database, deviceId: string, packets: readonly LivePacket[], now: number) {
  const out: D1PreparedStatement[] = [];
  for (const p of packets) {
    if (!p.rawAccepted || (p.quality !== 1 && p.quality !== 2) || p.trustedLatE7 === null || p.trustedLonE7 === null) continue;
    const uncertaintyM = p.uncertaintyCm / 100;
    if (!Number.isFinite(uncertaintyM) || uncertaintyM < 0 || uncertaintyM > 100) continue;
    out.push(
      db.prepare(
        "INSERT OR IGNORE INTO phase5_precise_endpoints(device_id,epoch,sequence,wall_time_ms,latitude,longitude,uncertainty_m,created_at) " +
        "SELECT ?1,?2,?3,?4,?5,?6,?7,?8 WHERE EXISTS " +
        "(SELECT 1 FROM devices WHERE id=?1 AND revoked_at IS NULL)"
      ).bind(deviceId, p.epoch, p.sequence, p.wallTimeMs, p.trustedLatE7 / 10_000_000, p.trustedLonE7 / 10_000_000, uncertaintyM, now)
    );
  }
  return out;
}

async function readFrame(env: RefinementEnv, row: FrameRow): Promise<SmoothingFrame> {
  const object = await env.HISTORY.get(row.r2_key);
  if (!object) throw Error('refinement object missing');
  let parsed: StoredFrameObject;
  try { parsed = JSON.parse(await object.text()) as StoredFrameObject; } catch { throw Error('invalid refinement object'); }
  if (!parsed || parsed.v !== 1 || parsed.recordId !== row.record_id || parsed.wallTimeMs !== row.wall_time_ms ||
      !ID_RE.test(parsed.originalRealtimeHypothesisId) || !Number.isFinite(parsed.maxSpeedMps) ||
      parsed.maxSpeedMps <= 0 || parsed.maxSpeedMps > 120 || !Array.isArray(parsed.hypotheses)) throw Error('invalid refinement object');
  const frame = {
    wallTimeMs: parsed.wallTimeMs,
    originalRealtimeHypothesisId: parsed.originalRealtimeHypothesisId,
    maxSpeedMps: parsed.maxSpeedMps,
    hypotheses: parsed.hypotheses
  };
  validateSmoothingFrame(frame);
  return frame;
}

function endpoint(row: EndpointRow): SmoothingEndpoint {
  return { latitude: row.latitude, longitude: row.longitude, uncertaintyM: row.uncertainty_m, wallTimeMs: row.wall_time_ms };
}

async function deterministicRunId(deviceId: string, start: EndpointRow, end: EndpointRow, frames: FrameRow[]) {
  const material = `${deviceId}|${start.epoch}:${start.sequence}|${end.epoch}:${end.sequence}|${frames.map(f => f.record_id).join(",")}`;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material)));
  return Array.from(digest.slice(0, 16), b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Refine any currently bounded degraded frames. Frames with no trusted endpoint on either side are
 * intentionally left pending; whichever arrives later (endpoint or evidence frame) can retry this.
 */
export async function processRefinementsForDevice(env: RefinementEnv, deviceId: string, now = Date.now()) {
  const frameResult = await env.DB.prepare(
    "SELECT record_id,wall_time_ms,r2_key FROM phase5_hypothesis_frames " +
    "WHERE device_id=?1 AND refined_run_id IS NULL ORDER BY wall_time_ms LIMIT ?2"
  ).bind(deviceId, MAX_UNREFINED_FRAMES).all<FrameRow>();
  const frames = frameResult.results.filter(f => Number.isSafeInteger(f.wall_time_ms));
  if (!frames.length) return 0;

  const earliest = frames[0].wall_time_ms;
  const latest = frames[frames.length - 1].wall_time_ms;
  const before = await env.DB.prepare(
    "SELECT epoch,sequence,wall_time_ms,latitude,longitude,uncertainty_m FROM phase5_precise_endpoints " +
    "WHERE device_id=?1 AND wall_time_ms<?2 ORDER BY wall_time_ms DESC LIMIT 1"
  ).bind(deviceId, earliest).first<EndpointRow>();
  const after = await env.DB.prepare(
    "SELECT epoch,sequence,wall_time_ms,latitude,longitude,uncertainty_m FROM phase5_precise_endpoints " +
    "WHERE device_id=?1 AND wall_time_ms>?2 ORDER BY wall_time_ms ASC LIMIT 1"
  ).bind(deviceId, latest).first<EndpointRow>();
  if (!before || !after) return 0;

  const endpoints = await env.DB.prepare(
    "SELECT epoch,sequence,wall_time_ms,latitude,longitude,uncertainty_m FROM phase5_precise_endpoints " +
    "WHERE device_id=?1 AND wall_time_ms>=?2 AND wall_time_ms<=?3 ORDER BY wall_time_ms,epoch,sequence"
  ).bind(deviceId, before.wall_time_ms, after.wall_time_ms).all<EndpointRow>();
  if (endpoints.results.length < 2) return 0;

  const groups = new Map<string, { start: EndpointRow; end: EndpointRow; frames: FrameRow[] }>();
  for (const frame of frames) {
    let start: EndpointRow | null = null;
    let end: EndpointRow | null = null;
    for (const ep of endpoints.results) {
      if (ep.wall_time_ms < frame.wall_time_ms) start = ep;
      if (ep.wall_time_ms > frame.wall_time_ms) { end = ep; break; }
    }
    if (!start || !end || end.wall_time_ms - start.wall_time_ms > MAX_SMOOTHING_INTERVAL_MS) continue;
    const key = `${start.epoch}:${start.sequence}|${end.epoch}:${end.sequence}`;
    const group = groups.get(key) ?? { start, end, frames: [] };
    group.frames.push(frame);
    groups.set(key, group);
  }

  let completed = 0, failed = false;
  for (const group of [...groups.values()].slice(0, 8)) {
    const smoothingFrames: SmoothingFrame[] = [];
    const usableRows: FrameRow[] = [];
    for (const row of group.frames) {
      try {
        const frame = await readFrame(env, row);
        smoothingFrames.push(frame);
        usableRows.push(row);
      } catch { failed = true; }
    }
    smoothingFrames.sort((a, b) => a.wallTimeMs - b.wallTimeMs);
    usableRows.sort((a, b) => a.wall_time_ms - b.wall_time_ms);
    if (!smoothingFrames.length) continue;

    let refined;
    try { refined = refineHypothesisInterval(endpoint(group.start), endpoint(group.end), smoothingFrames); }
    catch { failed = true; continue; }
    const runId = await deterministicRunId(deviceId, group.start, group.end, usableRows);
    const key = `history/refined/${safeDevice(deviceId)}/${day(group.start.wall_time_ms)}/${runId}.json`;
    const run: RefinedRunObject = {
      v: 1,
      runId,
      modelVersion: "phase5-smoothing-v1",
      fromMs: group.start.wall_time_ms,
      toMs: group.end.wall_time_ms,
      createdAt: now,
      frames: refined
    };
    await env.HISTORY.put(key, JSON.stringify(run), {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { kind: "phase5-refined-history", runId, modelVersion: run.modelVersion }
    });
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        "INSERT OR IGNORE INTO phase5_refined_intervals(id,device_id,from_ms,to_ms,model_version,source_r2_key,refined_r2_key,created_at) " +
        "VALUES(?1,?2,?3,?4,?5,NULL,?6,?7)"
      ).bind(runId, deviceId, run.fromMs, run.toMs, run.modelVersion, key, now)
    ];
    for (const row of usableRows) {
      statements.push(
        env.DB.prepare(
          "UPDATE phase5_hypothesis_frames SET refined_run_id=?1 WHERE device_id=?2 AND record_id=?3 AND refined_run_id IS NULL"
        ).bind(runId, deviceId, row.record_id)
      );
    }
    await env.DB.batch(statements);
    completed += usableRows.length;
  }
  if (failed) throw Error('refinement inputs unavailable');
  return completed;
}

export async function listRefinedHistory(env: RefinementEnv, deviceId: string, fromMs: number, toMs: number) {
  const start = Math.max(0, fromMs);
  const end = Math.min(Date.now() + 86_400_000, toMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 31 * 86_400_000) {
    throw new Phase5RefinedHistoryError("invalid refined history range");
  }
  const rows = await env.DB.prepare(
    "SELECT id,from_ms,to_ms,model_version,refined_r2_key,created_at FROM phase5_refined_intervals " +
    "WHERE device_id=?1 AND to_ms>=?2 AND from_ms<=?3 ORDER BY from_ms,created_at LIMIT 200"
  ).bind(deviceId, start, end).all<IntervalRow>();
  const runs: Array<{ id: string; fromMs: number; toMs: number; modelVersion: string; createdAt: number }> = [];
  const byTime = new Map<number, Record<string, unknown>>();
  for (const row of rows.results) {
    if (!row.refined_r2_key) continue;
    const object = await env.HISTORY.get(row.refined_r2_key);
    if (!object) continue;
    let run: RefinedRunObject;
    try { run = JSON.parse(await object.text()) as RefinedRunObject; } catch { continue; }
    if (run.v !== 1 || run.runId !== row.id || !Array.isArray(run.frames)) continue;
    runs.push({ id: row.id, fromMs: row.from_ms, toMs: row.to_ms, modelVersion: row.model_version, createdAt: row.created_at });
    for (const frame of run.frames) {
      if (!Number.isSafeInteger(frame.wallTimeMs) || frame.wallTimeMs < start || frame.wallTimeMs > end) continue;
      const existing = byTime.get(frame.wallTimeMs);
      if (!existing || row.created_at >= Number(existing.createdAt ?? 0)) {
        byTime.set(frame.wallTimeMs, { ...frame, runId: row.id, modelVersion: row.model_version, createdAt: row.created_at });
      }
    }
  }
  return { runs, points: [...byTime.values()].sort((a, b) => Number(a.wallTimeMs) - Number(b.wallTimeMs)) };
}

export async function cleanupPhase5RefinedHistory(env: RefinementEnv, now = Date.now(), limit = 100) {
  const bounded = Math.max(1, Math.min(250, Math.trunc(limit)));
  const frameCutoff = now - FRAME_RETENTION_MS;
  const refinedCutoff = now - REFINED_RETENTION_MS;

  const oldFrames = await env.DB.prepare(
    "SELECT record_id,r2_key FROM phase5_hypothesis_frames WHERE created_at<?1 ORDER BY created_at LIMIT ?2"
  ).bind(frameCutoff, bounded).all<{ record_id: string; r2_key: string }>();
  for (const row of oldFrames.results) await env.HISTORY.delete(row.r2_key);
  if (oldFrames.results.length) {
    const ids = oldFrames.results.map(r => r.record_id);
    for (const id of ids) await env.DB.prepare("DELETE FROM phase5_hypothesis_frames WHERE record_id=?1").bind(id).run();
  }

  const oldRuns = await env.DB.prepare(
    "SELECT id,refined_r2_key FROM phase5_refined_intervals WHERE to_ms<?1 ORDER BY to_ms LIMIT ?2"
  ).bind(refinedCutoff, bounded).all<{ id: string; refined_r2_key: string | null }>();
  for (const row of oldRuns.results) if (row.refined_r2_key) await env.HISTORY.delete(row.refined_r2_key);
  for (const row of oldRuns.results) await env.DB.prepare("DELETE FROM phase5_refined_intervals WHERE id=?1").bind(row.id).run();

  await env.DB.prepare("DELETE FROM phase5_precise_endpoints WHERE created_at<?1").bind(frameCutoff).run();
  return { hypothesisFramesDeleted: oldFrames.results.length, refinedRunsDeleted: oldRuns.results.length };
}
