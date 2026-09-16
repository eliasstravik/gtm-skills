export class ConnectionError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const requireThat = (condition, code, status = 400) => {
  if (!condition) throw new ConnectionError(code, status);
};
export const safeError = (error) => error instanceof ConnectionError
  ? { error: error.code, status: error.status }
  : { error: "connections_unavailable", status: 503 };
export async function readJson(request, limit = 16384) {
  requireThat(request.headers.get("content-type")?.split(";")[0] === "application/json", "json_required", 415);
  const reader = request.body?.getReader();
  requireThat(reader, "body_required");
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length; requireThat(size <= limit, "body_too_large", 413); chunks.push(value);
    }
  } finally { await reader.cancel(); }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new ConnectionError("invalid_json"); }
  requireThat(body && typeof body === "object" && !Array.isArray(body), "invalid_json");
  return body;
}
