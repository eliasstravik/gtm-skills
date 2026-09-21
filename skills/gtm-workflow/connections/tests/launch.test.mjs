// The launcher's local Postgres, on every system of the CI matrix. Needs the template's dependencies installed.
import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { workspaceState, writePrivateJson } from "../local/state.mjs";
import { SUPERUSER, createCluster, postgresTools } from "../local/database.mjs";

const here = dirname(fileURLToPath(import.meta.url)), templates = join(here, "../../templates");
const installed = existsSync(join(templates, "node_modules/embedded-postgres")), windows = process.platform === "win32";
const options = { skip: installed ? false : "install the template's dependencies first (npm ci in templates/)", timeout: 300_000 };
const local = installed ? await import(pathToFileURL(join(templates, "scripts/local-database.mjs"))) : null;
const FAKE_REMOTE = "DATABASE_URL=postgres://nobody:nothing@remote.invalid/db?sslmode=require\nDATABASE_URL_UNPOOLED=postgres://nobody:nothing@remote.invalid/db?sslmode=require\nPGHOST=remote.invalid\nPGSSLMODE=require\nPOSTGRES_URL=postgres://nobody:nothing@remote.invalid/db\n";

async function fixture(root, name, { converted = true, env = "" } = {}) {
  const workspace = join(root, name), workflows = join(workspace, "workflows");
  await mkdir(join(workflows, "scripts"), { recursive: true });
  await writeFile(join(workflows, "package.json"), JSON.stringify({ name, private: true, type: "module" }));
  await symlink(join(templates, "node_modules"), join(workflows, "node_modules"), windows ? "junction" : "dir");
  await writeFile(join(workflows, "scripts/build-viewer.mjs"), "");
  if (converted) {
    for (const script of ["local-database.mjs", "migrate.mjs"]) await cp(join(templates, "scripts", script), join(workflows, "scripts", script));
    for (const folder of ["drizzle-runtime", "drizzle"]) await cp(join(templates, folder), join(workflows, folder), { recursive: true });
  }
  if (env) await writeFile(join(workflows, ".env"), env);
  const state = await workspaceState(workspace, { create: true, root, boundary: root });
  await writePrivateJson(state.configPath, { workspace: state.workspace });
  return { workspace, workflows, root };
}
function start({ workspace, root }, mode = "dev", env = {}) {
  const shell = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:DATABASE_URL|PG|POSTGRES_|GTM_DATABASE)/.test(name)));
  const child = spawn(process.execPath, [join(here, "fixtures/launch-runner.mjs"), workspace, root, mode], { env: { ...shell, ...env }, stdio: ["pipe", "pipe", "pipe"] });
  let output = "", errors = "";
  child.stderr.on("data", (data) => { errors += data; });
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  const ready = new Promise((resolve, reject) => {
    child.stdout.on("data", (data) => { output += data; if (/READY \d+/.test(output)) resolve(); });
    exited.then((code) => reject(Object.assign(new Error(errors.trim() || `launcher exited with ${code}`), { code })));
  });
  return {
    child, ready, exited, errors: () => errors,
    seen: async () => JSON.parse(await readFile(join(root, `seen-${child.pid}.json`), "utf8")),
    async stop(signal) { if (signal && !windows) child.kill(signal); else child.stdin.write("close\n"); return exited; },
  };
}
const same = (a, b) => { const real = (path) => { const value = realpathSync.native(path); return windows ? value.toLowerCase() : value; }; return real(a) === real(b); };
async function sandbox(work) {
  const root = await mkdtemp(join(homedir(), ".gtm-launch-test-")), launchers = [];
  try { await work(root, (...args) => { const launcher = start(...args); launchers.push(launcher); return launcher; }); }
  finally {
    for (const launcher of launchers) if (launcher.child.exitCode === null && launcher.child.signalCode === null) await launcher.stop();
    // A test that killed its launcher on purpose leaves a server; stop only what the folder check proves.
    const tools = await postgresTools(templates), { stopCluster } = await import("../local/database.mjs");
    for (const name of await readdir(root)) {
      const workflows = join(root, name, "workflows");
      if (existsSync(workflows) && await local.provenPort(workflows, { ...SUPERUSER, database: "postgres" })) stopCluster(tools, local.dataDirectory(workflows));
    }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

test("dev starts this workspace's Postgres as the plain role, migrates, ignores a remote .env, and stops cleanly", options, () => sandbox(async (root, launch) => {
  const ws = await fixture(root, "one", { env: FAKE_REMOTE });
  for (const signal of windows ? [undefined] : ["SIGINT", "SIGTERM", undefined]) {
    const launcher = launch(ws);
    await launcher.ready;
    const seen = await launcher.seen();
    assert.match(seen.DATABASE_URL, /^postgres:\/\/gtm:gtm@127\.0\.0\.1:\d+\/gtm\?sslmode=disable$/);
    assert.equal(seen.DATABASE_URL_UNPOOLED, seen.DATABASE_URL);
    assert.deepEqual(seen.leaked, []);
    assert.equal(seen.user, "gtm");
    assert.ok(same(seen.folder, local.dataDirectory(ws.workflows)));
    // The migrate step ran against 127.0.0.1 too: the remote host in .env does not resolve, so it would have failed.
    assert.ok(seen.tables.includes("gtm.people") && seen.tables.includes("public.example_scores"));
    assert.equal(Number(await readFile(join(ws.workflows, "data/launcher.pid"), "utf8")), launcher.child.pid);
    assert.equal(await launcher.stop(signal), 0);
    assert.equal(existsSync(join(ws.workflows, "data/pg/postmaster.pid")), false, `server still running after ${signal ?? "close"}`);
    assert.equal(existsSync(join(ws.workflows, "data/launcher.pid")), false);
  }
}));

test("Ctrl+C under npm reaches the launcher twice, and a closed terminal sends SIGHUP: the server still stops", { ...options, skip: options.skip || (windows ? "no such signals on Windows" : false) }, () => sandbox(async (root, launch) => {
  const ws = await fixture(root, "one");
  for (const signals of [["SIGINT", "SIGINT"], ["SIGINT", "SIGTERM"], ["SIGHUP"]]) {
    const launcher = launch(ws);
    await launcher.ready;
    // The terminal signals the whole foreground group and npm forwards the signal as well.
    for (const signal of signals) { launcher.child.kill(signal); await new Promise((resolve) => setTimeout(resolve, 30)); }
    await launcher.exited;
    assert.equal(existsSync(join(ws.workflows, "data/pg/postmaster.pid")), false, `server still running after ${signals.join(" + ")}`);
    assert.equal(existsSync(join(ws.workflows, "data/launcher.pid")), false, `launcher file left after ${signals.join(" + ")}`);
  }
}));

test("a server left by a killed launcher is reused and then stopped; a second launcher is refused while one is alive", options, () => sandbox(async (root, launch) => {
  const ws = await fixture(root, "one");
  const first = launch(ws);
  await first.ready;
  const again = launch(ws);
  await assert.rejects(again.ready, /Already running for this workspace/);
  const url = (await first.seen()).DATABASE_URL;
  first.child.kill("SIGKILL");
  await first.exited;
  assert.equal(await local.localDatabaseUrl(ws.workflows), url, "the server outlives its launcher");
  const second = launch(ws);
  await second.ready;
  assert.equal((await second.seen()).DATABASE_URL, url, "reused, not restarted");
  assert.equal(await second.stop(), 0);
  assert.equal(existsSync(join(ws.workflows, "data/pg/postmaster.pid")), false);
}));

test("two workspaces each reach only their own server, and a forged pid file is rejected without touching the other server", options, () => sandbox(async (root, launch) => {
  const one = await fixture(root, "one"), two = await fixture(root, "two");
  const first = launch(one), second = launch(two);
  await Promise.all([first.ready, second.ready]);
  const [a, b] = [await first.seen(), await second.seen()];
  assert.notEqual(a.DATABASE_URL, b.DATABASE_URL);
  assert.ok(same(a.folder, local.dataDirectory(one.workflows)) && same(b.folder, local.dataDirectory(two.workflows)));
  assert.equal(await second.stop(), 0);

  const real = await readFile(join(one.workflows, "data/pg/postmaster.pid"), "utf8"), forged = join(two.workflows, "data/pg/postmaster.pid");
  // A dead process id with the other workspace's port: rejected, cleared, and workspace two starts its own server.
  await writeFile(forged, real.replace(/^\d+/, "999999"));
  await assert.rejects(local.localDatabaseUrl(two.workflows), /start `npm run dev` first/);
  const third = launch(two);
  await third.ready;
  assert.ok(same((await third.seen()).folder, local.dataDirectory(two.workflows)));
  assert.equal(await third.stop(), 0);
  // The other workspace's live Postgres process id: never adopted, never signalled.
  await writeFile(forged, real);
  await assert.rejects(local.localDatabaseUrl(two.workflows), /start `npm run dev` first/);
  await assert.rejects(launch(two).ready, /does not answer for this folder/);
  assert.equal(await local.localDatabaseUrl(one.workflows), a.DATABASE_URL, "the other workspace's server is untouched");
  assert.equal(await first.stop(), 0);
}));

test("a folder created without the role heals on start; the viewer never migrates and needs an existing database", options, () => sandbox(async (root, launch) => {
  const ws = await fixture(root, "one");
  await assert.rejects(launch(ws, "viewer").ready, /run `npm run dev` once first/);
  await mkdir(join(ws.workflows, "data"), { recursive: true });
  createCluster(await postgresTools(ws.workflows), local.dataDirectory(ws.workflows));
  const viewer = launch(ws, "viewer");
  await viewer.ready;
  const seen = await viewer.seen();
  assert.equal(seen.user, "gtm");
  assert.deepEqual(seen.tables, [], "opening the viewer ran no migration");
  assert.equal(await viewer.stop(), 0);
}));

test("GTM_DATABASE=external is honoured from the shell only, starts nothing and never migrates", options, () => sandbox(async (root, launch) => {
  const host = await fixture(root, "host"), hosting = launch(host);
  await hosting.ready;
  const pg = (await import(pathToFileURL(createRequire(join(templates, "package.json")).resolve("pg")))).default;
  const port = new URL((await hosting.seen()).DATABASE_URL).port;
  const admin = new pg.Client({ host: "127.0.0.1", port, ...SUPERUSER, database: "postgres" });
  await admin.connect(); await admin.query("CREATE DATABASE elsewhere OWNER gtm"); await admin.end();
  const elsewhere = `postgres://gtm:gtm@127.0.0.1:${port}/elsewhere?sslmode=disable`;

  const ws = await fixture(root, "one", { env: `GTM_DATABASE=external\n${FAKE_REMOTE}` });
  const fromEnvFile = launch(ws);
  await fromEnvFile.ready;
  assert.match((await fromEnvFile.seen()).DATABASE_URL, /\/gtm\?sslmode=disable$/, ".env cannot choose an external database");
  assert.equal(await fromEnvFile.stop(), 0);

  const other = await fixture(root, "two", { env: FAKE_REMOTE });
  const external = launch(other, "dev", { GTM_DATABASE: "external", DATABASE_URL: elsewhere });
  await external.ready;
  const seen = await external.seen();
  assert.equal(seen.DATABASE_URL, elsewhere);
  assert.equal(seen.DATABASE_URL_UNPOOLED, elsewhere);
  assert.deepEqual(seen.leaked, []);
  assert.deepEqual(seen.tables, [], "an external database is never migrated by the launcher");
  assert.equal(existsSync(join(other.workflows, "data/pg")), false);
  assert.match(external.errors(), /external database on 127\.0\.0\.1:\d+/);
  assert.doesNotMatch(external.errors(), /gtm:gtm/);
  assert.equal(await external.stop(), 0);
  assert.equal(await hosting.stop(), 0);
}));

test("an empty, garbage or dead launcher file never wedges the workspace", options, () => sandbox(async (root, launch) => {
  const ws = await fixture(root, "one"), file = join(ws.workflows, "data/launcher.pid");
  await mkdir(join(ws.workflows, "data"), { recursive: true });
  // A crash between creating the file and writing it leaves it empty; Number("") is 0 and signal 0 to pid 0 succeeds.
  for (const left of ["", "0", "-1", "not a pid", "999999"]) {
    await writeFile(file, left);
    const launcher = launch(ws);
    await launcher.ready;
    assert.equal(Number(await readFile(file, "utf8")), launcher.child.pid, `after a launcher file holding ${JSON.stringify(left)}`);
    assert.equal(await launcher.stop(), 0);
  }
}));

// Needs no Postgres, so it is never skipped. The claimers stay up and are told the millisecond to go, so every round
// is a tight race whatever the machine is doing, and the round's winner is alive while the others look at its claim.
test("exactly one of many simultaneous claims wins, whatever was left behind", { timeout: 300_000 }, async () => {
  const root = await mkdtemp(join(homedir(), ".gtm-claim-test-")), claim = join(root, "claims", "launcher.pid"), takeover = `${claim}.takeover`;
  const script = `import { claimLauncher } from ${JSON.stringify(pathToFileURL(join(here, "../local/database.mjs")).href)};
    import { createInterface } from "node:readline";
    console.log("ready");
    for await (const line of createInterface({ input: process.stdin })) {
      const at = Number(line); while (Date.now() < at) {}
      try { claimLauncher(${JSON.stringify(claim)}); console.log("won"); } catch (error) { console.log(error.message.startsWith("Already running") ? "refused" : error.message); }
    }`;
  const claimers = Array.from({ length: 16 }, () => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["pipe", "pipe", "inherit"] });
    const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
    return { child, next: async () => (await lines.next()).value, exited: new Promise((resolve) => child.on("exit", resolve)) };
  });
  try {
    for (const claimer of claimers) assert.equal(await claimer.next(), "ready");
    // A takeover file is what a launcher killed while clearing a leftover leaves; with no leftover nobody looks at it.
    const dead = "999999", states = [
      { left: null }, { left: "" }, { left: "not a pid" }, { left: dead },
      { left: "", takeover: "" }, { left: dead, takeover: dead }, { left: null, takeover: dead, remains: ["launcher.pid.takeover"] },
      { left: String(process.pid), winners: 0 }, { left: dead, takeover: String(process.pid), winners: 0, remains: ["launcher.pid.takeover"] },
    ];
    for (let round = 0; round < 40; round++) for (const { left, takeover: held, winners = 1, remains = [] } of states) {
      await rm(dirname(claim), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      await mkdir(dirname(claim), { recursive: true });
      if (left !== null) await writeFile(claim, left);
      if (held !== undefined) await writeFile(takeover, held);
      const at = Date.now() + 20;
      for (const claimer of claimers) claimer.child.stdin.write(`${at}\n`);
      const results = await Promise.all(claimers.map((claimer) => claimer.next())), state = `round ${round}, ${JSON.stringify({ left, held })}: ${results.join(",")}`;
      assert.equal(results.filter((result) => result === "won").length, winners, state);
      assert.equal(results.filter((result) => result === "refused").length, claimers.length - winners, state);
      // The winner holds the file it was given, a refused round left it as it was, and nothing else was written.
      const owner = Number(await readFile(claim, "utf8"));
      assert.equal(owner, winners ? claimers[results.indexOf("won")].child.pid : Number(left), state);
      assert.deepEqual((await readdir(dirname(claim))).filter((name) => name !== "launcher.pid"), remains, state);
    }
  } finally {
    for (const claimer of claimers) claimer.child.stdin.end();
    await Promise.all(claimers.map((claimer) => claimer.exited));
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test("a workspace that was not converted gets one line saying so", options, () => sandbox(async (root, launch) => {
  const ws = await fixture(root, "old", { converted: false });
  await assert.rejects(launch(ws).ready, /from before the Postgres runtime/);
  assert.equal(existsSync(join(ws.workflows, "data")), false);
}));
