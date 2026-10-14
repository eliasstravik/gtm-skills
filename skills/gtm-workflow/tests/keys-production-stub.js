// The production Keys page's Vercel side, for tests/connections-browser-check.mjs: served by tests/browser-fixture.ts
// before the page's own script. `window.__keys` is what Vercel would say; the check moves it along: `release` is the
// newest build's state, `build` that of the build the last save started (absent: Vercel does not list it yet).
(() => {
  const real = window.fetch.bind(window);
  const keys = (window.__keys = { release: { state: "live" }, application: { state: "idle" }, saved: [] });
  const json = (body) => Promise.resolve(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }));
  window.fetch = (input, init = {}) => {
    const url = new URL(String(input), location.href);
    if (url.pathname === "/api/viewer" && url.searchParams.get("op") === "release") {
      const change = url.searchParams.get("change");
      // Asked about a save, as lib/connections-apply.ts releaseStatus answers: its own build, "updating" until listed.
      const release = !change ? keys.release : change === keys.application.id ? { ...(keys.build ?? { state: "updating" }), change } : { state: "updating", change };
      return json({ version: Number(url.searchParams.get("v")), release });
    }
    if (url.pathname === "/api/connection-management/session") return json({ csrf: "fixture" });
    if (url.pathname === "/api/connection-management") {
      if (init.method === "POST") {
        const body = JSON.parse(init.body);
        keys.saved.push(body.variable);
        keys.application = { id: body.id, state: "applying" };
        keys.build = undefined;
        return json({ saved: true, requiresDeployment: true, application: keys.application });
      }
      return json({ mode: "production", canWrite: true, application: keys.application, workflowsUrl: "/viewer", missing: [],
        connections: keys.saved.map((variable) => ({ id: variable, name: variable, status: "Saved", usage: [], usageComplete: true,
          fields: [{ variable, label: variable, version: "1", editable: true, state: "saved" }] })) });
    }
    return real(input, init);
  };
})();
