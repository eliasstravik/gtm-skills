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
  evaluate('window.__keys.release = { state: "updating" }; 1');
  command("wait", "6000");
  assert.equal(badge()[0], "updating");
  evaluate('window.__keys.release = { state: "live" }; window.__keys.application = { ...window.__keys.application, state: "applied" }; localStorage.setItem("gtm-viewer-release-started", String(Date.now() - 60000)); document.dispatchEvent(new Event("visibilitychange")); 1');
  waitBadge("live");
  assert.deepEqual(badge(), ["live", "Production · Your change is live", green]);
  shot("3-production-live");
  command("wait", "--fn", '!document.querySelector(".environment-badge").dataset.state', "--timeout", "15000");
  assert.deepEqual(badge(), ["", "Production", green]);

  // A build that failed: red, with Vercel's page for it, and Retry.
  await add("BLITZ_API_KEY", "Blitz");
  waitBadge("updating", 2000);
  evaluate('window.__keys.release = { state: "failed", details: "https://vercel.com/acme/workflows/build" }; window.__keys.application = { ...window.__keys.application, state: "failed" }; localStorage.setItem("gtm-viewer-release-started", String(Date.now() - 60000)); document.dispatchEvent(new Event("visibilitychange")); 1');
  waitBadge("failed");
  assert.deepEqual(badge(), ["failed", "Production · Update failedDetails", red]);
  command("wait", "--text", "Couldn’t apply changes");
  shot("4-production-failed");

  // Saved here, then straight to Workflows, Runs and Data: each badge is amber before its first check answers.
  evaluate('window.__keys.release = { state: "live" }; window.__keys.application = { state: "idle" }; localStorage.removeItem("gtm-connections-application"); 1');
  await add("MONID_API_KEY", "Monid");
  waitBadge("updating", 2000);
  for (const [path, text] of [["/viewer", "Enrich network"], ["/viewer?view=runs", "wrun_"], ["/viewer?view=data", "matching record"]]) {
    command("open", `http://127.0.0.1:3942${path}`);
    command("wait", "--text", text);
    assert.deepEqual(badge(), ["updating", "Production · Updating…live in about a minute", amber], path);
  }
  shot("5-production-workflows-right-after-save");

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
