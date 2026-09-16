import { ConnectionError, requireThat } from "./errors.mjs";
export async function boundedResponse(response, limit = 2 * 1024 * 1024) {
  const reader = response.body?.getReader(); requireThat(reader, "upstream_unavailable", 503);
  const chunks = []; let size = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length;
      requireThat(size <= limit, "upstream_too_large", 503); chunks.push(value); }
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch { throw new ConnectionError("upstream_unavailable", 503); }
  finally { await reader.cancel(); }
}
