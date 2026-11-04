export type DeviceIngestRateEnv = { DEVICE_RATE?: { limit(input: { key: string }): Promise<{ success: boolean }> } };
// Called only after bounded signature/schema validation. These direct handlers
// bypass the older base Worker's quota, so each must fail closed before writes.
export async function requireDeviceIngestRate(env: DeviceIngestRateEnv, deviceId: string, scope: "fall" | "screen-time"): Promise<Response | null> {
  const unavailable = () => Response.json({ error: "device limiter unavailable; retry" }, { status:503, headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"} });
  if (!env.DEVICE_RATE || typeof env.DEVICE_RATE.limit !== "function") return unavailable();
  try {
    const result = await env.DEVICE_RATE.limit({ key: `${deviceId}:${scope}` });
    if (result?.success !== true) return Response.json({ error:"rate limited" }, { status:429, headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"} });
  } catch { return unavailable(); }
  return null;
}
