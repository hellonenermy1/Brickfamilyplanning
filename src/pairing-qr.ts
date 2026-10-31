import encodeQR from "qr";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

export function pairingQrResponse(req: Request): Response {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) {
    return new Response("Invalid pairing token", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
    });
  }
  if (url.protocol !== "https:") {
    return new Response("HTTPS required", { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const payload = `brick://pair?api=${encodeURIComponent(url.origin)}&token=${encodeURIComponent(token)}`;
  const svg = encodeQR(payload, "svg", { ecc: "quartile", border: 4, scale: 5 });
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; style-src 'none'; script-src 'none'; object-src 'none'; frame-ancestors 'none'; sandbox"
    }
  });
}
