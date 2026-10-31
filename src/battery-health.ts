export type BatteryHealthEnv = { DB: D1Database };

type Sample = { received_at: number; battery_pct: number | null; charging: number | null };
type Window = { ratePctPerHour: number | null; observedMs: number; dropPct: number; pairs: number };

function summarize(samples: Sample[], from: number, to: number): Window {
  let observedMs = 0, dropPct = 0, pairs = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (a.received_at < from || b.received_at > to) continue;
    const dt = b.received_at - a.received_at;
    if (dt < 10_000 || dt > 10 * 60_000) continue;
    if (a.charging !== 0 || b.charging !== 0 || a.battery_pct == null || b.battery_pct == null) continue;
    if (a.battery_pct < 0 || a.battery_pct > 100 || b.battery_pct < 0 || b.battery_pct > 100) continue;
    // Battery gauges are quantized and can occasionally move up by 1% while unplugged. Count valid
    // observation time, but never treat a gauge increase as negative drain.
    observedMs += dt;
    dropPct += Math.max(0, a.battery_pct - b.battery_pct);
    pairs++;
  }
  return {
    ratePctPerHour: observedMs >= 30 * 60_000 ? dropPct * 3_600_000 / observedMs : null,
    observedMs, dropPct, pairs
  };
}

export async function batteryDrainTrend(env: BatteryHealthEnv, deviceId: string, now = Date.now()) {
  const since = now - 7 * 86_400_000;
  const r = await env.DB.prepare(
    "SELECT received_at,battery_pct,charging FROM device_health_samples WHERE device_id=?1 AND received_at>=?2 AND received_at<=?3 AND battery_pct IS NOT NULL ORDER BY received_at ASC"
  ).bind(deviceId, since, now).all<Sample>();
  const samples = r.results;
  const recentStart = now - 3 * 60 * 60_000;
  const recent = summarize(samples, recentStart, now);
  const baseline = summarize(samples, since, recentStart);

  let status: "not_enough_data" | "normal" | "elevated" = "not_enough_data";
  let reason = "Need at least 60 minutes of unplugged recent data and 6 hours of baseline data.";
  if (recent.observedMs >= 60 * 60_000 && baseline.observedMs >= 6 * 60 * 60_000 && recent.ratePctPerHour !== null && baseline.ratePctPerHour !== null) {
    const threshold = Math.max(10, baseline.ratePctPerHour * 2);
    const elevated = recent.dropPct >= 5 && recent.ratePctPerHour >= threshold;
    status = elevated ? "elevated" : "normal";
    reason = elevated
      ? "Recent unplugged drain is at least 2× this device's measured baseline, at least 10%/hour, and includes a ≥5% observed drop."
      : "Recent unplugged drain does not meet Brick's conservative elevated-drain rule.";
  }

  return Response.json({
    status,
    reason,
    recent: { ...recent, hoursObserved: recent.observedMs / 3_600_000 },
    baseline: { ...baseline, hoursObserved: baseline.observedMs / 3_600_000 },
    rule: { baselineMultiplier: 2, minimumRatePctPerHour: 10, minimumRecentDropPct: 5, minimumRecentHours: 1, minimumBaselineHours: 6 },
    measuredAt: now
  }, { headers: { "Cache-Control": "no-store" } });
}
