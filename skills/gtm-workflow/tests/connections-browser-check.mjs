// A save on the Keys page shows on every status badge at once: Production turns amber the moment Vercel accepts the
// change, green again once it is live, red when it failed; Local turns amber while the server reloads with the key.
// Start both fixtures first:
//   GTM_VIEWER_FIXTURE_WORKSPACE=1 node tests/serve.mjs <runtime> &   (production, 3942)
//   GTM_VIEWER_FIXTURE_LOCAL=1 node tests/serve.mjs <runtime> &       (local, 3944)
// then: node tests/connections-browser-check.mjs [screenshot folder]
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
const shots = process.argv[2] ? resolve(process.argv[2]) : undefined;
if (shots) mkdirSync(shots, { recursive: true });
const command = (...args) => {
  const result = spawnSync("agent-browser", ["--session", "gtm-connections-acceptance", ...args], { encoding: "utf8", timeout: 40000 });
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  return result.stdout.trim();
};
const evaluate = (code) => JSON.parse(command("eval", code));
const shot = (name) => { if (shots) command("screenshot", join(shots, `${name}.png`)); };
const badge = () => JSON.parse(evaluate('JSON.stringify((b => [b.dataset.state ?? "", b.textContent, getComputedStyle(b).color])(document.querySelector(".environment-badge")))'));
const waitBadge = (state, timeout = 20000) => command("wait", "--fn", `document.querySelector(".environment-badge")?.dataset.state === ${JSON.stringify(state)}`, "--timeout", String(timeout));
const green = "rgb(16, 125, 50)", amber = "rgb(163, 82, 0)", red = "rgb(203, 42, 47)";
async function add(variable, label) {
  command("click", "button.primary");
  command("wait", "dialog[open]");
  if (label) command("fill", "#connection-label", label);
  command("fill", "#variable", variable);
  command("fill", "#new-key", "sk-fixture");
  command("click", ".connection-submit");
}
try {
  command("set", "viewport", "1280", "720");

  // Production: Vercel has accepted the save, its build is not listed yet, and the badge is amber already.
  command("open", "http://127.0.0.1:3942/connections");
  command("wait", "--text", "No connections yet");
  assert.deepEqual(badge(), ["", "Production", green]);
  shot("1-production-before-save");
  await add("APOLLO_API_KEY", "Apollo");
  command("wait", "--fn", '!document.querySelector("dialog[open]")');
  assert.deepEqual(badge(), ["updating", "Production · Updating…live in about a minute", amber], "amber as soon as the save returns");
  assert.equal(evaluate("window.__keys.release.state"), "live", "before any check could have seen the build");
  shot("2-production-right-after-save");
  // Building, then serving: green again, saying so for a few seconds.
  evaluate('window.__keys.build = { state: "updating" }; 1');
  command("wait", "6000");
  assert.equal(badge()[0], "updating");
  evaluate('window.__keys.build = { state: "live" }; window.__keys.release = { state: "live" }; window.__keys.application = { ...window.__keys.application, state: "applied" }; document.dispatchEvent(new Event("visibilitychange")); 1');
  waitBadge("live");
  assert.deepEqual(badge(), ["live", "Production · Your change is live", green]);
  shot("3-production-live");
  command("wait", "--fn", '!document.querySelector(".environment-badge").dataset.state', "--timeout", "15000");
  assert.deepEqual(badge(), ["", "Production", green]);

  // A build that failed: red, with Vercel's page for it, and Retry.
  await add("BLITZ_API_KEY", "Blitz");
  waitBadge("updating", 2000);
  evaluate('window.__keys.build = window.__keys.release = { state: "failed", details: "https://vercel.com/acme/workflows/build" }; window.__keys.application = { ...window.__keys.application, state: "failed" }; document.dispatchEvent(new Event("visibilitychange")); 1');
  waitBadge("failed");
  assert.deepEqual(badge(), ["failed", "Production · Update failedDetails", red]);
  command("wait", "--text", "Couldn’t apply changes");
  shot("4-production-failed");
  // A new save after that failure: the old build's failure is not this update's, amber until its own build says.
  await add("SECOND_API_KEY", "Second");
  waitBadge("updating", 2000);
  command("wait", "7000");
  assert.deepEqual(badge(), ["updating", "Production · Updating…live in about a minute", amber], "an older failed build never marks a new save failed");
  assert.equal(evaluate('document.querySelectorAll(".environment-badge a").length'), 0);
  evaluate('window.__keys.build = { state: "live" }; window.__keys.release = { state: "live" }; window.__keys.application = { ...window.__keys.application, state: "applied" }; document.dispatchEvent(new Event("visibilitychange")); 1');
  waitBadge("live");

  // Saved here, then Workflows, Runs and Data, while Vercel has not listed the build even half a minute later: each
  // badge stays amber, never green on the older build that still serves.
  evaluate('window.__keys.release = { state: "live" }; window.__keys.application = { state: "idle" }; localStorage.removeItem("gtm-connections-application"); 1');
  await add("MONID_API_KEY", "Monid");
  waitBadge("updating", 2000);
  evaluate('(s => localStorage.setItem("gtm-viewer-release-started", JSON.stringify({ ...s, at: Date.now() - 30000 })))(JSON.parse(localStorage.getItem("gtm-viewer-release-started"))); 1');
  for (const [path, text] of [["/viewer", "Enrich network"], ["/viewer?view=runs", "wrun_"], ["/viewer?view=data", "matching record"]]) {
    command("open", `http://127.0.0.1:3942${path}`);
    command("wait", "--text", text);
    command("wait", "6000");
    assert.deepEqual(badge(), ["updating", "Production · Updating…live in about a minute", amber], path);
  }
  shot("5-production-workflows-right-after-save");
  // Answers that are not about this save, the older build still serving or an older failure, never end it either.
  const answer = (release) => evaluate(`(() => { const f = window.__fetch ??= window.fetch; window.fetch = (u, o) => String(u).includes("op=release") ? Promise.resolve(new Response(JSON.stringify({ version: 3, release: ${release} }), { headers: { "content-type": "application/json" } })) : f(u, o); document.dispatchEvent(new Event("visibilitychange")); return 1; })()`);
  for (const release of ['{ state: "live" }', '{ state: "failed", details: "https://vercel.com/acme/workflows/old-build" }']) {
    answer(release);
    command("wait", "1500");
    assert.deepEqual(badge(), ["updating", "Production · Updating…live in about a minute", amber], release);
  }
  // Its own build is live: green, on this page too.
  evaluate('window.__changeId = JSON.parse(localStorage.getItem("gtm-viewer-release-started")).change; 1');
  answer('{ state: "live", change: window.__changeId }');
  waitBadge("live");
  assert.equal(evaluate('localStorage.getItem("gtm-viewer-release-started")'), null, "settled once its build is live");

  // Local: the server reloads with the saved key in a few seconds, no restart, and the badge follows it.
  command("open", "http://127.0.0.1:3944/connections");
  command("wait", "--text", "No connections yet");
  assert.deepEqual(badge(), ["", "Local", amber]);
  command("wait", "--text", "a few seconds after you save it");
  assert.ok(!evaluate("document.body.textContent.includes('npm run dev')"), "no command to type");
  await add("APOLLO_API_KEY");
  command("wait", "--fn", '!document.querySelector("dialog[open]")');
  assert.deepEqual(badge(), ["updating", "Local · Updating…ready in a few seconds", amber], "amber as soon as the save returns");
  shot("6-local-right-after-save");
  waitBadge("live", 10000);
  assert.deepEqual(badge(), ["live", "Local · Your change is ready", amber]);
  shot("7-local-ready");
  assert.ok(!evaluate("document.body.textContent.includes('estart')"), "nothing to restart");
  console.log("Connections: a save turns Production amber at once, then green when live or red when failed, on the Keys page and on Workflows, Runs and Data; locally the badge follows the server's reload with the new key.");
} finally { command("close"); }
