import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { McpServer } from "./mcp";

/** A single invocation's declared MCP transport. Provider credentials stay in the parent. */
export async function mcpCredentialAdapter(server: McpServer, credential: string, { fetcher = fetch }: { fetcher?: typeof fetch } = {}) {
  const upstream = new URL(server.url);
  if (upstream.protocol !== "https:" || upstream.username || upstream.password || upstream.hash || !server.allow?.length)
    throw Error("Authenticated MCP requires a fixed HTTPS URL and explicit tool allowlist");
  const allow = new Set(server.allow), bearer = randomBytes(32).toString("base64url");
  const header = server.header ?? "Authorization";
  if (!/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(header)) throw Error("Invalid MCP credential header");
  const limit = 1_000_000;
  const lifetime = new AbortController();
  const listener = createServer(async (request, response) => {
    const refuse = (status: number) => { response.writeHead(status, { "cache-control": "no-store" }); response.end("MCP request unavailable"); };
    const given = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
    if (request.headers.host !== `127.0.0.1:${port}` || request.url !== "/mcp" || request.socket.remoteAddress !== "127.0.0.1" ||
      Object.keys(request.headers).some((name) => name === "origin" || name === "forwarded" || name.startsWith("x-forwarded-")) ||
      Buffer.byteLength(given) !== Buffer.byteLength(bearer) || !timingSafeEqual(Buffer.from(given), Buffer.from(bearer))) return refuse(403);
    if (request.method !== "POST") return refuse(405);
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of request) { bytes += chunk.length; if (bytes > limit) return refuse(413); chunks.push(chunk); }
      const message = JSON.parse(Buffer.concat(chunks).toString());
      if (!message || Array.isArray(message) || !["initialize", "notifications/initialized", "ping", "tools/list", "tools/call"].includes(message.method)) return refuse(403);
      if (message.method === "tools/call" && !allow.has(message.params?.name)) return refuse(403);
      const result = await fetcher(upstream, { method: "POST", redirect: "error", signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(server.timeoutMs ?? 45000)]), headers: {
        "content-type": "application/json", accept: "application/json, text/event-stream",
        [header]: server.bearer === false ? credential : `Bearer ${credential}`,
        ...(typeof request.headers["mcp-session-id"] === "string" ? { "mcp-session-id": request.headers["mcp-session-id"] } : {}),
        ...(typeof request.headers["mcp-protocol-version"] === "string" ? { "mcp-protocol-version": request.headers["mcp-protocol-version"] } : {}),
      }, body: JSON.stringify(message) });
      if (!result.ok) { await result.body?.cancel(); return refuse(502); }
      if (result.status === 202 || result.status === 204) { await result.body?.cancel(); response.writeHead(result.status); return response.end(); }
      const reader = result.body?.getReader(); if (!reader) return refuse(502);
      const output: Uint8Array[] = []; bytes = 0;
      try {
        for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; if (bytes > limit) return refuse(502); output.push(value); }
      } finally { await reader.cancel(); }
      let text = Buffer.concat(output).toString();
      if (text.includes(credential) || result.headers.get("mcp-session-id")?.includes(credential)) return refuse(502);
      const filter = (payload: any) => {
        if (message.method === "tools/list" && Array.isArray(payload.result?.tools)) payload.result.tools = payload.result.tools.filter((tool: any) => allow.has(tool.name));
        return payload;
      };
      const contentType = result.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) text = text.replaceAll("\r\n", "\n").split("\n\n").map((event) => {
        const lines = event.split("\n"), data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        return data ? [...lines.filter((line) => !line.startsWith("data:")), `data: ${JSON.stringify(filter(JSON.parse(data)))}`].join("\n") : event;
      }).join("\n\n");
      else if (contentType.includes("application/json")) text = JSON.stringify(filter(JSON.parse(text)));
      else return refuse(502);
      response.writeHead(result.status, { "content-type": contentType, "cache-control": "no-store", ...(result.headers.get("mcp-session-id") ? { "mcp-session-id": result.headers.get("mcp-session-id")! } : {}) });
      response.end(text);
    } catch { refuse(502); }
  });
  await new Promise<void>((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = (listener.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}/mcp`, headers: { Authorization: `Bearer ${bearer}` }, close: async () => {
    lifetime.abort();
    listener.closeAllConnections(); await new Promise<void>((resolve) => listener.close(() => resolve()));
  } };
}
export function cliEnvironment(environment: NodeJS.ProcessEnv) {
  const allowed = new Set(["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TERM", "COLORTERM", "SYSTEMROOT", "SystemRoot", "APPDATA", "LOCALAPPDATA", "USERPROFILE", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"]);
  return Object.fromEntries(Object.entries(environment).filter(([name]) => allowed.has(name)));
}
