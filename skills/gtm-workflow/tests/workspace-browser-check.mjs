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
  // Workspace pages share one layout: tabs and title never move when switching between them.
  const place = 'JSON.stringify(["nav", "h1"].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top]; }))';
  const places = ["/viewer", "/viewer?view=data", "/connections"].map((path) => {
    command("open", `http://127.0.0.1:3942${path}`);
    command("wait", "--fn", 'document.querySelector("h1") && !document.querySelector("[aria-busy=true]")');
    command("wait", "--text", path.includes("data") ? "matching record" : path === "/viewer" ? "Enrich network" : "Connections");
    return evaluate(place);
  });
  assert.ok(places.every((p) => p === places[0]), places.join(" "));
  command("open", "http://127.0.0.1:3942/viewer");
  command("wait", "--text", "Connections");
  assert.deepEqual(evaluate('[...document.querySelectorAll(".root-navigation a")].map(a=>a.textContent)'), ["Workflows", "Runs", "Data", "Connections"]);
  // Groups from groups.ts in file order, then Other; each row says how it starts and how its last run went.
  command("wait", "--fn", 'document.querySelectorAll(".last-run").length > 3');
  assert.deepEqual(evaluate('[...document.querySelectorAll(".group-header h2")].map(h=>h.textContent.replace("›","").trim())'), ["Network", "Market research", "Other"]);
  const markets = '[...document.querySelectorAll(".workflow-group")].find(s=>s.getAttribute("aria-label")==="Market research")';
  assert.equal(evaluate(`${markets}.querySelectorAll(".workflow-row").length`), 3, "a group shows its first three workflows");
  assert.equal(evaluate(`${markets}.querySelector(".more").textContent`), "+ 3 more");
  assert.equal(evaluate(`${markets}.querySelector(".workflow-row .status").textContent`), "failed", "failing first in the preview");
  assert.ok(evaluate('document.body.textContent.includes("Daily 07:00 UTC") && document.body.textContent.includes("Stage of Research market 01") && document.body.textContent.includes("Webhook")'));
  // Each row names the tables its workflow reads or writes.
  const network = '[...document.querySelectorAll(".workflow-row")].find(r=>r.querySelector("h3").textContent==="Enrich network")';
  assert.deepEqual(evaluate(`[...${network}.querySelectorAll(".table-name")].map(t=>t.textContent)`), ["fixture_people", "fixture_companies"]);
  command("click", '.chips button:nth-child(3)');
  command("wait", "--fn", 'new URL(location.href).searchParams.get("filter") === "failing"');
  assert.ok(evaluate('[...document.querySelectorAll(".workflow-row .status")].every(s=>s.textContent==="failed")'));
  command("fill", '[aria-label="Search workflows, tables, providers…"]', "Research market 06");
  command("wait", "--fn", 'document.querySelectorAll(".workflow-row").length === 1');
  // A group's page: the workspace's tabs, narrowed to the group, under a breadcrumb.
  command("open", "http://127.0.0.1:3942/viewer?group=markets");
  command("wait", "--text", "Research market 06");
  assert.deepEqual(evaluate('[...document.querySelectorAll("nav.tabs a")].map(a=>a.textContent.replace(/\\d+/,"").trim())'), ["Workflows", "Runs", "Data"]);
  assert.equal(evaluate('document.querySelectorAll(".group-workflows .workflow-row").length'), 6);
  assert.ok(evaluate('[...document.querySelectorAll(".group-workflows .workflow-row")].every(r=>r.querySelectorAll(".table-name").length > 0)'), "group rows name their tables");
  command("click", 'nav.tabs a[href$="view=runs"]');
  command("wait", "--text", "wrun_");
  assert.deepEqual(evaluate('[...document.querySelector("[name=filter-runs-by-workflow]").options].map(o=>o.textContent).length'), 7, "the workflow filter lists the group's six");
  command("open", "http://127.0.0.1:3942/viewer?workflow=workflow-2");
  command("wait", "--text", "Market research");
  assert.equal(evaluate('document.querySelector(".breadcrumbs a:nth-of-type(2)").getAttribute("href")'), "/viewer?group=markets");
  // At phone width rows wrap instead of running off the edge.
  command("set", "viewport", "390", "844");
  command("open", "http://127.0.0.1:3942/viewer");
  command("wait", "--text", "Market research");
  assert.equal(evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  command("set", "viewport", "1280", "800");
  command("open", "http://127.0.0.1:3942/viewer");
  command("wait", "--text", "Connections");
  command("click", '.root-navigation a[href="/viewer?view=data"]');
  command("wait", "--text", "matching records");
  // The Data tab opens on workspace results; runtime bookkeeping such as the cache shows only when asked for.
  const tables = () => evaluate('[...document.querySelector("[name=data-table]").options].map(o=>o.textContent)');
  assert.ok(!tables().includes("cache"), tables().join());
  assert.notEqual(evaluate('document.querySelector("[name=data-table]").selectedOptions[0].textContent'), "cache");
  command("click", "button[aria-pressed=false]");
  command("wait", "--fn", '[...document.querySelector("[name=data-table]").options].some(o=>o.textContent==="cache")');
  command("click", "button[aria-pressed=true]");
  command("wait", "--fn", '![...document.querySelector("[name=data-table]").options].some(o=>o.textContent==="cache")');
  const table = evaluate('[...document.querySelector("[name=data-table]").options].find(o=>o.textContent==="imported_contacts").value');
  command("select", "[name=data-table]", table);
  command("wait", "--text", "Ada Import");
  command("fill", '[aria-label="Search data"]', "Ada");
  command("wait", "--text", "1 matching record");
  assert.equal(evaluate('document.querySelectorAll("tbody tr").length'), 1);
  assert.equal(evaluate('new URL(location.href).searchParams.has("workflow")'), false);
  assert.equal(evaluate('document.querySelector(".toolbar a.button").textContent.trim()'), "Open database ↗");
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
  // The name column comes first and stays at the left edge while the grid scrolls sideways.
  command("set", "viewport", "900", "700");
  command("open", "http://127.0.0.1:3942/viewer?workflow=stable&view=data&table=companies&columns=key,domain,description,industries,name,enrichment_status");
  command("wait", "--text", "matching record");
  assert.deepEqual(evaluate('[...document.querySelectorAll(".data-grid thead th")].slice(1,3).map(th=>th.textContent.trim())'), ["name", "domain"]);
  assert.equal(evaluate('document.querySelector(".data-grid thead th:last-child").textContent.trim()'), "key", "key goes last once a name leads");
  const pinnedLeft = () => evaluate('Math.round(document.querySelector(".data-grid tbody td.pinned").getBoundingClientRect().left)');
  const before = pinnedLeft();
  command("eval", 'document.querySelector(".table-scroll").scrollLeft = 400');
  command("eval", "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  assert.ok(evaluate('document.querySelector(".table-scroll").scrollLeft') > 0, "the grid scrolls sideways");
  assert.equal(pinnedLeft(), before, "the name column stays in view");
  console.log("Workspace navigation, groups with last runs, chips and search, group pages, hidden runtime tables, pinned name column, unregistered data, search, columns, export and private Runs destination passed.");
} finally { command("close"); }
