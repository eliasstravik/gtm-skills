import test from "node:test";
import assert from "node:assert/strict";
import { cliEnvironment, mcpCredentialAdapter } from "../templates/lib/cli-mcp-proxy";

test("nested CLI receives only its explicit nonsecret environment", () => {
  const safe = cliEnvironment({ PATH: "/bin", HOME: "/test", MONID_API_KEY: "synthetic-provider", GTM_RUN_SECRET: "synthetic-transport",
    VERCEL_TOKEN: "synthetic-admin", ANTHROPIC_API_KEY: "synthetic-provider", CLAUDE_CODE_SESSION_ID: "parent", UNKNOWN: "value" });
  assert.deepEqual(safe, { PATH: "/bin", HOME: "/test" });
});
test("MCP adapter preserves allowed calls while keeping provider credentials in the parent", async () => {
  const credential = "synthetic-provider-sentinel";
  let calls = 0, eventStream = false, echo = false;
  const adapter = await mcpCredentialAdapter({ url: "https://mcp.example/api", keyEnv: "MONID_API_KEY", allow: ["lookup"] }, credential, {
    fetcher: async (url, init) => {
      calls++; assert.equal(String(url), "https://mcp.example/api"); assert.equal(init?.redirect, "error");
      assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${credential}`);
      const message = JSON.parse(String(init?.body));
      const reply = { jsonrpc: "2.0", id: message.id, result: message.method === "tools/list" ? { tools: [{ name: "lookup" }, { name: "delete_everything" }] } : { content: [{ type: "text", text: echo ? credential : "ok" }] } };
      return eventStream ? new Response(`event: message\ndata: ${JSON.stringify(reply, null, 2).replaceAll("\n", "\ndata: ")}\n\n`, { headers: { "content-type": "text/event-stream" } }) : Response.json(reply);
    },
  });
  const call = (method: string, params = {}, extra = {}) => fetch(adapter.url, { method: "POST", headers: { ...adapter.headers, "content-type": "application/json", ...extra }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  try {
    assert.equal(JSON.stringify(adapter).includes(credential), false);
    assert.equal((await call("initialize")).status, 200);
    assert.deepEqual((await (await call("tools/list")).json()).result.tools, [{ name: "lookup" }]);
    assert.equal((await call("tools/call", { name: "lookup", arguments: {} })).status, 200);
    const before = calls;
    assert.equal((await call("tools/call", { name: "delete_everything" })).status, 403);
    assert.equal((await call("tools/list", {}, { origin: "http://localhost:7777" })).status, 403);
    assert.equal((await fetch(adapter.url)).status, 403);
    assert.equal(calls, before);
    eventStream = true;
    const event = await (await call("tools/list")).text();
    assert.match(event, /lookup/); assert.doesNotMatch(event, /delete_everything/);
    echo = true;
    const rejected = await call("tools/call", { name: "lookup" }); assert.equal(rejected.status, 502); assert.doesNotMatch(await rejected.text(), /synthetic-provider-sentinel/);
  } finally { await adapter.close(); }
  await assert.rejects(() => fetch(adapter.url));
});
