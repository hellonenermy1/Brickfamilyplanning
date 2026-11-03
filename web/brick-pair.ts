import encodeQR from "qr";

const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

export function pairingQrDataUrl(apiOrigin: string, token: string): string {
  const origin = new URL(apiOrigin);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("invalid Brick API origin");
  }
  if (!TOKEN_RE.test(token)) throw new Error("invalid Brick pairing token");
  const payload = `brick://pair?api=${encodeURIComponent(origin.origin)}&token=${encodeURIComponent(token)}`;
  return encodeQR(payload, "data-url", { ecc: "quartile", border: 4, scale: 5 });
}
