// The production Keys page's Vercel side, for tests/connections-browser-check.mjs: served by tests/browser-fixture.ts
// before the page's own script. `window.__keys` is what Vercel would say; the check moves it along.
(() => {
  const real = window.fetch.bind(window);
  const keys = (window.__keys = { release: { state: "live" }, application: { state: "idle" }, saved: [] });
  const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }));
  window.fetch = (input, init = {}) => {
    const url = new URL(String(input), location.href);
    if (url.pathname === "/api/viewer" && url.searchParams.get("op") === "release")
      return json({ version: Number(url.searchParams.get("v")), release: keys.release });
    if (url.pathname === "/api/connection-management/session") return json({ csrf: "fixture" });
    if (url.pathname === "/api/connection-management") {
      if (init.method === "POST") {
        const body = JSON.parse(init.body);
        keys.saved.push(body.variable);
        keys.application = { id: body.id, state: "applying" };
        return json({ saved: true, requiresDeployment: true, application: keys.application });
      }
      return json({ mode: "production", canWrite: true, application: keys.application, workflowsUrl: "/viewer", missing: [],
        connections: keys.saved.map((variable) => ({ id: variable, name: variable, status: "Saved", usage: [], usageComplete: true,
          fields: [{ variable, label: variable, version: "1", editable: true, state: "saved" }] })) });
    }
    return real(input, init);
  };
})();
