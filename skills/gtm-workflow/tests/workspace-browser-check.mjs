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
  command("eval", "localStorage.clear()");
  command("open", "http://127.0.0.1:3942/viewer");
  // Groups from groups.ts in file order, then Ungrouped: one line per workflow, a dot for its last run and its name.
  const loaded = 'document.querySelectorAll(".wf-dot:not(.wf-dot-loading)").length > 3';
  command("wait", "--fn", loaded);
  assert.deepEqual(evaluate('[...document.querySelectorAll(".wf-group-name")].map(h=>h.textContent)'), ["Network", "Market research", "Ungrouped"]);
  const markets = '.wf-group[aria-label="Market research"]';
  const titles = (scope = "") => evaluate(`[...document.querySelectorAll('${scope} .wf-link')].map(a=>a.textContent)`);
  // A pipeline starts closed: its stage is hidden under it, and the header still counts all six.
  assert.deepEqual(titles(markets), ["Research market 01", "Research market 02", "Research market 04", "Research market 05", "Research market 06"]);
  assert.equal(evaluate(`document.querySelector('${markets} .wf-count').textContent`), "6");
  assert.equal(evaluate(`document.querySelector('${markets} .wf-group-state').textContent`), "2 failing");
  assert.equal(evaluate(`document.querySelector('${markets} .wf-row .wf-stages').textContent`), "1 stage · 1 running", "a closed pipeline shows its stages' state");
  assert.ok(evaluate('[...document.querySelectorAll(".wf-row")].every(r=>r.textContent===r.querySelector(".wf-link").textContent+(r.querySelector(".wf-stages")?.textContent ?? ""))'),
    "a row says nothing but its name, and a pipeline its stages");
  assert.equal(evaluate(`document.querySelector('${markets} .wf-dot-failed').title.startsWith("Last run failed")`), true, "the dot's tooltip says how and when");
  // Opening the pipeline shows its stage on the tree line under it, and the page remembers it.
  command("click", 'button[aria-label="Show the stage of Research market 01"]');
  command("wait", "--text", "Research market 03");
  assert.deepEqual(evaluate(`[...document.querySelectorAll('${markets} .wf-row')].slice(0, 2).map(r=>r.dataset.depth)`), ["0", "1"]);
  // A closed group keeps only its header.
  command("click", `${markets} .wf-group-toggle`);
  command("wait", "--fn", `!document.querySelector('${markets} .wf-rows')`);
  command("reload");
  command("wait", "--fn", loaded);
  assert.equal(evaluate(`document.querySelector('${markets} .wf-group-toggle').getAttribute("aria-expanded")`), "false", "a closed group stays closed");
  command("click", `${markets} .wf-group-toggle`);
  command("wait", "--text", "Research market 03");
  // The Failing filter: only failed runs, each under its pipeline.
  command("click", ".wf-failing");
  command("wait", "--fn", 'new URL(location.href).searchParams.get("filter") === "failing"');
  assert.ok(evaluate('[...document.querySelectorAll(".wf-row:not(.wf-context) .wf-dot")].every(d=>d.classList.contains("wf-dot-failed"))'));
  command("click", ".wf-failing");
  command("wait", "--fn", '!new URL(location.href).searchParams.has("filter")');
  // Search reaches a stage in a closed pipeline and shows the pipeline above it, dimmed.
  command("click", 'button[aria-label="Hide the stage of Research market 01"]');
  command("fill", '[aria-label="Search workflows, tables, providers…"]', "Research market 03");
  command("wait", "--fn", 'document.querySelectorAll(".wf-row").length === 2');
  assert.deepEqual(titles(), ["Research market 01", "Research market 03"]);
  assert.equal(evaluate('document.querySelector(".wf-row").classList.contains("wf-context")'), true);
  // A group's page: the workspace's tabs, narrowed to the group, under a breadcrumb; its pipelines start open.
  command("open", "http://127.0.0.1:3942/viewer?group=markets");
  command("wait", "--text", "Research market 06");
  assert.deepEqual(evaluate('[...document.querySelectorAll("nav.tabs a")].map(a=>a.textContent.replace(/\\d+/,"").trim())'), ["Workflows", "Runs", "Data"]);
  assert.equal(evaluate('document.querySelectorAll(".group-workflows .wf-row").length'), 6);
  command("click", 'nav.tabs a[href$="view=runs"]');
  command("wait", "--text", "wrun_");
  assert.deepEqual(evaluate('[...document.querySelector("[name=filter-runs-by-workflow]").options].map(o=>o.textContent).length'), 7, "the workflow filter lists the group's six");
  command("open", "http://127.0.0.1:3942/viewer?workflow=workflow-2");
  command("wait", "--text", "Market research");
  assert.equal(evaluate('document.querySelector(".breadcrumbs a:nth-of-type(2)").getAttribute("href")'), "/viewer?group=markets");
  // How it starts is on its own page, not on the list.
  command("wait", "--text", "Starts: Daily 07:00 UTC");
  // A stage's breadcrumb runs through its pipeline.
  command("open", "http://127.0.0.1:3942/viewer?workflow=workflow-3");
  command("wait", "--text", "Market research");
  assert.deepEqual(evaluate('[...document.querySelectorAll(".breadcrumbs a")].map(a=>a.getAttribute("href"))'), ["/viewer", "/viewer?group=markets", "/viewer?workflow=workflow-1"]);
  // At phone width rows take two lines instead of running off the edge.
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
  console.log("Workspace navigation, groups and pipelines that open and close, a dot and a name a row, the Failing filter and search, group pages, stage breadcrumbs, hidden runtime tables, pinned name column, unregistered data, search, columns, export and private Runs destination passed.");
} finally { command("close"); }
