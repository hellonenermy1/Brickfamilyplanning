const MAP_KEY = "basemap/singapore.pmtiles";
const META_KEY = "basemap/singapore.meta.json";

export type PrivateMapEnv = { MAPS: R2Bucket };

function cacheHeaders() {
  return new Headers({
    "Content-Type": "application/vnd.pmtiles",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  });
}

export async function privateMapStatus(env: PrivateMapEnv) {
  const object = await env.MAPS.head(MAP_KEY);
  if (!object) return Response.json({ installed: false, region: "singapore" }, { headers: { "Cache-Control": "no-store" } });
  let metadata: Record<string, unknown> = {};
  const meta = await env.MAPS.get(META_KEY);
  if (meta && "body" in meta) {
    try { metadata = await meta.json<Record<string, unknown>>(); } catch { metadata = {}; }
  }
  return Response.json({
    installed: true,
    region: "singapore",
    bytes: object.size,
    uploadedAt: object.uploaded.getTime(),
    etag: object.etag,
    metadata
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function servePrivateBasemap(req: Request, env: PrivateMapEnv) {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  if (req.method === "HEAD") {
    const head = await env.MAPS.head(MAP_KEY);
    if (!head) return new Response("Private basemap not installed", { status: 503, headers: { "Cache-Control": "no-store" } });
    const headers = cacheHeaders();
    headers.set("Content-Length", String(head.size));
    headers.set("ETag", head.httpEtag);
    return new Response(null, { status: 200, headers });
  }

  const object = await env.MAPS.get(MAP_KEY, { range: req.headers, onlyIf: req.headers });
  if (!object) return new Response("Private basemap not installed", { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!("body" in object)) return new Response(null, { status: 412, headers: { ETag: object.httpEtag } });

  const headers = cacheHeaders();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/vnd.pmtiles");
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");

  const range = object.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (range) {
    const length = range.length ?? Math.min(range.suffix ?? object.size, object.size);
    const offset = range.offset ?? Math.max(0, object.size - length);
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("Content-Length", String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}
