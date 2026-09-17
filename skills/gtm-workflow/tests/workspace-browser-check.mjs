// Start GTM_VIEWER_FIXTURE_WORKSPACE=1 node tests/serve.mjs <runtime> first.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const command = (...args) => {
  const result = spawnSync("agent-browser", ["--session", "gtm-workspace-acceptance", ...args], { encoding: "utf8", timeout: 40000 });
  if (result.status !== 0) throw Error(result.stderr || result.stdout);
  return result.stdout.trim();
};
const evaluate = code => JSON.parse(command("eval", code));
try {
  command("open", "http://127.0.0.1:3942/viewer");
  command("wait", "--text", "Connections");
  assert.deepEqual(evaluate('[...document.querySelectorAll(".root-navigation a")].map(a=>a.textContent)'), ["Workflows", "Data", "Connections"]);
  command("click", '.root-navigation a[href="/viewer?view=data"]');
  command("wait", "--text", "matching records");
  const table = evaluate('[...document.querySelector("[name=data-table]").options].find(o=>o.textContent==="imported_contacts").value');
  command("select", "[name=data-table]", table);
  command("wait", "--text", "Ada Import");
  command("fill", '[aria-label="Search data"]', "Ada");
  command("wait", "--text", "1 matching records");
  assert.equal(evaluate('document.querySelectorAll("tbody tr").length'), 1);
  assert.equal(evaluate('new URL(location.href).searchParams.has("workflow")'), false);
  assert.equal(evaluate('document.querySelector(".toolbar a.button").textContent.trim()'), "Open in Turso ↗");
  command("click", ".columns-trigger");
  command("uncheck", 'input[type=checkbox][value=email]');
  command("click", ".columns-apply");
  command("wait", "--fn", 'document.querySelectorAll("thead th button").length === 1');
  const rows = evaluate('(async()=>{const p=new URLSearchParams(location.search);p.set("op","export");p.set("format","json");p.set("v","3");return (await fetch("/api/viewer?"+p)).json()})()');
  assert.deepEqual(rows, [{ name: "Ada Import" }]);
  command("open", "http://127.0.0.1:3942/viewer?workflow=stable&view=runs&status=failed");
  command("wait", "--text", "No matching runs.");
  assert.equal(evaluate('document.querySelector(".runs-pane .toolbar a").href'), "https://vercel.com/acme/workflows/workflows/runs?environment=production");
  command("open", "http://127.0.0.1:3942/viewer?workflow=stable&view=runs&preview=runs");
  command("wait", "--text", "Completed");
  assert.equal(evaluate('document.querySelector(".runs-pane .toolbar a")'), null);
  console.log("Workspace navigation, unregistered data, search, columns, export and private Runs destination passed.");
} finally { command("close"); }
