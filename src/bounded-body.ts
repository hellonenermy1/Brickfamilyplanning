export type BoundedBodyResult =
  | { ok: true; body: ArrayBuffer }
  | { ok: false; reason: "too_large" | "read_failed" };

/**
 * Read at most maxBytes from a request body. Unlike Request.arrayBuffer() followed by a length
 * check, this stops reading as soon as the application limit is exceeded, including when a client
 * omits Content-Length and streams/chunks the request.
 */
export async function readBoundedBody(req: Request, maxBytes: number): Promise<BoundedBodyResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error("invalid body limit");

  const declaredRaw = req.headers.get("Content-Length");
  if (declaredRaw !== null) {
    const declared = Number(declaredRaw);
    if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  }

  const stream = req.body;
  if (!stream) return { ok: true, body: new ArrayBuffer(0) };
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "read_failed" };
  } finally {
    try { reader.releaseLock(); } catch { /* stream already cancelled/released */ }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body: merged.buffer };
}
