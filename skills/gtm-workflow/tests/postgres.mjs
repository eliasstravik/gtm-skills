// One Postgres per test run, from the template's embedded-postgres package, started the way the launcher starts it.
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { SUPERUSER, createCluster, postgresTools, startCluster, stopCluster } from "../connections/local/database.mjs";

/**
 * One Postgres for the whole run, in its own folder under a known parent. Several worktrees run tests at once, so
 * clean only folders whose runner is dead, and stop a leftover server only after the folder check proved it.
 */
export async function startTestPostgres(runtime) {
  const local = await import(pathToFileURL(join(runtime, "scripts/local-database.mjs")));
  const parent = join(tmpdir(), "gtm-test-postgres"), tools = await postgresTools(runtime);
  await mkdir(parent, { recursive: true });
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; } };
  for (const entry of await readdir(parent)) {
    const old = join(parent, entry), runner = Number(await readFile(join(old, "runner.pid"), "utf8").catch(() => NaN));
    // An empty or garbage runner file is a dead run: signal 0 to pid 0 would test this process's own group.
    if (Number.isInteger(runner) && runner > 0 && alive(runner)) continue;
    if (await local.provenPort(old, { ...SUPERUSER, database: "postgres" })) stopCluster(tools, local.dataDirectory(old));
    await rm(old, { recursive: true, force: true }).catch(() => {});
  }
  // The folder is made beside the parent and moved in with its runner file written: one that showed up without it
  // would be a dead run to another run's cleanup above.
  const made = await mkdtemp(`${parent}-new-`), home = join(parent, `run-${made.slice(`${parent}-new-`.length)}`), directory = local.dataDirectory(home);
  await writeFile(join(made, "runner.pid"), String(process.pid));
  await rename(made, home);
  await mkdir(dirname(directory), { recursive: true });
  createCluster(tools, directory);
  const port = await startCluster(tools, directory, join(home, "postgres.log"));
  if (!port) throw new Error(`The test Postgres did not start; see ${join(home, "postgres.log")}`);
  await local.ensureAppRole(port, SUPERUSER);
  return { port, async stop() { stopCluster(tools, directory); await rm(home, { recursive: true, force: true }).catch(() => {}); } };
}

