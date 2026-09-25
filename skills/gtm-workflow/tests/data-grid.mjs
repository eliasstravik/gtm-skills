// The Data grid shows a table of thousands of rows without pages: node tests/data-grid.mjs <runtime> [screenshot dir].
// Needs agent-browser. Starts the Nitro dev server the way live-refresh.mjs does, over a copy of the template on its own
// Postgres with 5,000 seeded rows, then scrolls, searches, changes rows under the open page and exports. Every row
// read is Neon data transfer, so it also checks that the page reads only the rows near the screen.
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { startTestPostgres } from "./postgres.mjs";

const runtime = resolve(process.argv[2] ?? "templates");
const shots = process.argv[3] ? resolve(process.argv[3]) : undefined;
const dir = await mkdtemp(join(tmpdir(), "gtm-data-grid-"));
const run = promisify(execFile);
const PORT = 3944, origin = `http://127.0.0.1:${PORT}`, ROWS = 5000;
for (const name of await readdir(runtime))
  if (!["node_modules", ".output", ".nitro", "public"].includes(name)) await cp(join(runtime, name), join(dir, name), { recursive: true });
await mkdir(join(dir, "node_modules"));
for (const name of await readdir(join(runtime, "node_modules")))
  if (!name.startsWith(".") || name === ".bin") await symlink(join(runtime, "node_modules", name), join(dir, "node_modules", name));
const postgres = await startTestPostgres(runtime);
const url = `postgres://gtm:gtm@127.0.0.1:${postgres.port}/gtm`;
Object.assign(process.env, { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, VERCEL_DEPLOYMENT_ID: "dpl_grid" });
const require = createRequire(join(dir, "package.json"));
const pg = require("pg");
let nitro;
// Never spawnSync here: this process is also the server the browser is loading.
const browser = async (...args) => {
  try {
    const { stdout } = await run("agent-browser", ["--session", "gtm-data-grid", ...args], { encoding: "utf8", timeout: 60000 });
    return stdout.trim();
  } catch (error) {
    throw Error(`agent-browser ${args.join(" ")}: ${error.stderr || error.stdout || error.message}`);
  }
};
const evaluate = async (code) => JSON.parse(await browser("eval", code));
const waitFor = (code, timeout = 30000) => browser("wait", "--fn", code, "--timeout", String(timeout));
const sql = async (text) => {
  const client = new pg.Client(url);
  await client.connect();
  try { await client.query(text); } finally { await client.end(); }
};
// Records each data read the page sends: its window of rows, and whether it asked for one record.
const watchReads = () => evaluate(`(() => { window.gridMarker = true; window.reads = []; const f = window.fetch;
  window.fetch = (u, o) => { const p = new URL(u, location.href).searchParams;
    if (p.get("op") === "data") window.reads.push({ offset: Number(p.get("offset")), limit: Number(p.get("limit")), key: p.get("key") });
    return f(u, o); }; return true; })()`);
const rowsRead = () => evaluate("window.reads.filter((r) => !r.key).reduce((n, r) => n + r.limit, 0)");
const scrollTo = (index) => evaluate(`(() => { const box = document.querySelector(".table-scroll");
  box.scrollTop = ${index} * 37; return true; })()`);
const hasCell = (text) => `[...document.querySelectorAll(".data-grid td")].some((td) => td.textContent === ${JSON.stringify(text)})`;
const footer = () => browser("get", "text", ".grid-footer");

try {
  for (const script of ["scripts/build-viewer.mjs", "scripts/migrate.mjs"]) {
    const result = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  // A roles-like JSON list in every row, as a People table has: the grid must leave it in the database.
  await sql(`CREATE TABLE contacts (id INTEGER PRIMARY KEY, name TEXT, score INTEGER, roles JSONB);
    INSERT INTO contacts SELECT x, 'Person ' || x, x % 97, jsonb_build_array(jsonb_build_object('title', 'Founder', 'company', 'Company ' || x, 'description', repeat('Long evidence text. ', 40)), jsonb_build_object('title', 'Advisor'))
    FROM generate_series(1, ${ROWS}) x`);
  process.chdir(dir);
  const { createNitro, prepare, build } = await import(pathToFileURL(require.resolve("nitro/builder")));
  const { NitroDevServer } = await import(pathToFileURL(join(dirname(require.resolve("nitro/package.json")), "dist/_dev.mjs")));
  nitro = await createNitro({ rootDir: dir, dev: true, _cli: { command: "dev" } }, { dotenv: false, watch: true });
  await new NitroDevServer(nitro).listen({ port: PORT, hostname: "127.0.0.1" });
  await prepare(nitro);
  await build(nitro);

  await browser("set", "viewport", "1440", "900");
  await browser("open", `${origin}/viewer?view=data&table=contacts&sort=id`);
  await waitFor(hasCell("Person 1"));
  await watchReads();
  assert.match(await footer(), /5,000 matching records/);
  assert.equal(await evaluate('document.querySelector(".pagination, [aria-label=\\"Data pages\\"]") === null'), true, "no pages");
  if (shots) await browser("screenshot", join(shots, "data-grid-top.png"));

  // One edge: the tabs, the heading, the toolbar and the table start at the same x.
  const edges = await evaluate(`(() => ({
    tab: document.querySelector(".root-navigation a").getBoundingClientRect().left,
    heading: document.querySelector(".title-row h1").getBoundingClientRect().left,
    toolbar: document.querySelector(".toolbar > *").getBoundingClientRect().left,
    table: document.querySelector(".data-grid").getBoundingClientRect().left }))()`);
  for (const [name, x] of Object.entries(edges)) assert.ok(Math.abs(x - edges.heading) <= 1, `${name} starts at ${x}, the heading at ${edges.heading}`);

  // The list is as tall as the table, but only the rows near the screen are drawn.
  const drawn = await evaluate('document.querySelectorAll(".data-grid tr[data-index]").length');
  assert.ok(drawn > 10 && drawn < 80, `${drawn} rows drawn`);
  assert.ok(await evaluate('document.querySelector(".table-scroll").scrollHeight') > ROWS * 30, "the scrollbar spans the table");
  // A JSON value stays in the database: the cell shows its count.
  assert.equal(await evaluate('document.querySelector(".data-grid button.folded").textContent'), "2 entries");

  // Scroll to the end, the way a scrollbar drag does: the rows in between are never read.
  await scrollTo(ROWS);
  await waitFor(hasCell("Person 5000"));
  assert.equal(await evaluate("window.gridMarker === true"), true, "scrolling must not reload the page");
  const afterEnd = await rowsRead();
  assert.ok(afterEnd <= 300, `scrolling to the end read ${afterEnd} rows`);
  assert.ok(await evaluate('document.querySelectorAll(".data-grid tr[data-index]").length') < 80);
  if (shots) await browser("screenshot", join(shots, "data-grid-end.png"));

  // The middle: rows arrive where the scroll rests, numbered by their place in the table.
  await scrollTo(2500);
  await waitFor(hasCell("Person 2500"));
  assert.equal(await evaluate(`[...document.querySelectorAll(".data-grid tr[data-index]")].find((tr) => [...tr.cells].some((c) => c.textContent === "Person 2500")).querySelector("th").textContent`), "2500");

  // A change under the open page: the pulse re-reads only the rows on screen, not the table and not the first page.
  await evaluate("(window.reads = [], true)");
  await sql("UPDATE contacts SET name = 'Changed 2500' WHERE id = 2500");
  await waitFor(hasCell("Changed 2500"), 40000);
  const refresh = await evaluate("window.reads.filter((r) => !r.key)");
  assert.ok(refresh.length >= 1 && refresh.every((r) => r.limit <= 60 && r.offset > 2400), `refresh read ${JSON.stringify(refresh)}`);
  assert.equal(await evaluate("window.gridMarker === true"), true, "a change must not reload the page");

  // Opening a folded value reads that one record and shows it whole.
  await evaluate("(window.reads = [], true)");
  await evaluate('(document.querySelector(".data-grid button.folded").click(), true)');
  await waitFor('document.querySelector(".value-dialog[open]")?.textContent.includes("Long evidence text")');
  const opened = await evaluate("window.reads");
  assert.equal(opened.length, 1);
  assert.ok(opened[0].key, "a folded value is read from its record");
  await evaluate('(document.querySelector(".value-dialog").close(), true)');

  // Arrow keys move past the drawn window: the grid scrolls and draws the row.
  await evaluate('(document.querySelector(".data-grid td[data-column=\\"0\\"]").focus(), true)');
  const start = await evaluate('Number(document.activeElement.dataset.row)');
  for (let i = 0; i < 40; i++) await browser("press", "ArrowDown");
  // A row below the rows read so far takes focus once it arrives.
  await waitFor(`Number(document.activeElement.dataset.row) === ${start + 40}`, 10000);

  // Search: the toolbar stays while the rows load, so typing is not interrupted, and the list starts at the top.
  await browser("fill", 'input[aria-label="Search data"]', "Person 4999");
  await waitFor(`document.querySelector(".grid-footer").textContent.includes("1 matching record")`);
  assert.equal(await evaluate('document.activeElement?.getAttribute("aria-label")'), "Search data");
  assert.ok(await evaluate(hasCell("Person 4999")));
  assert.equal(await evaluate('document.querySelector(".table-scroll").scrollTop'), 0);
  // Clearing with real keys: an empty fill sets the value without an input event.
  for (let i = 0; i < "Person 4999".length; i++) await browser("press", "Backspace");
  await waitFor(`document.querySelector(".grid-footer").textContent.includes("5,000 matching records")`);

  // Export still carries every matching row, JSON whole.
  const exported = await evaluate(`fetch("/api/viewer?op=export&format=json&v=3&view=data&table=contacts&sort=id").then((r) => r.json()).then((rows) => ({ n: rows.length, roles: rows[4999].roles.length }))`);
  assert.deepEqual(exported, { n: ROWS, roles: 2 });
  console.log(`Data grid: ${ROWS} rows without pages, ${drawn} drawn; the end read ${afterEnd} rows; a change re-read ${refresh.map((r) => r.limit).join("+")} rows on screen; search, keys, folded values and export work; one left edge.`);
} finally {
  await browser("close").catch(() => {});
  await nitro?.close();
  await postgres.stop();
  await rm(dir, { recursive: true, force: true });
}
process.exit(0);
