function b64ToBytes(s: string): Uint8Array {
  const binary = atob(s);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function derEcdsaToP1363(der: Uint8Array, scalarBytes = 32): Uint8Array {
  if (der.length === scalarBytes * 2) return der;
  if (der.length < 8 || der[0] !== 0x30) throw new Error("invalid ECDSA DER signature");
  let o = 1;
  const seqLen = der[o++];
  if ((seqLen & 0x80) !== 0 || seqLen !== der.length - 2) throw new Error("unsupported ECDSA DER length");
  if (der[o++] !== 0x02) throw new Error("invalid ECDSA r");
  const rLen = der[o++];
  const r = der.slice(o, o + rLen); o += rLen;
  if (der[o++] !== 0x02) throw new Error("invalid ECDSA s");
  const sLen = der[o++];
  const s = der.slice(o, o + sLen); o += sLen;
  if (o !== der.length) throw new Error("trailing ECDSA signature bytes");

  const normalize = (n: Uint8Array) => {
    let start = 0;
    while (start < n.length - 1 && n[start] === 0) start++;
    const stripped = n.slice(start);
    if (stripped.length > scalarBytes) throw new Error("ECDSA scalar too large");
    const out = new Uint8Array(scalarBytes);
    out.set(stripped, scalarBytes - stripped.length);
    return out;
  };

  const raw = new Uint8Array(scalarBytes * 2);
  raw.set(normalize(r), 0);
  raw.set(normalize(s), scalarBytes);
  return raw;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyDeviceSignature(publicKeySpkiB64: string, payload: ArrayBuffer, sigB64: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "spki",
    b64ToBytes(publicKeySpkiB64),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  const p1363 = derEcdsaToP1363(b64ToBytes(sigB64));
  return crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    p1363,
    payload
  );
}

export function randomToken(bytes = 24): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
