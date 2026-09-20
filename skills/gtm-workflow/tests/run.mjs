#!/usr/bin/env node
// Run from any checkout with an installed workflow runtime: node tests/run.mjs /path/to/workflows
// Neon check (by hand, never in CI): NEON_CHECK_URL and NEON_CHECK_URL_UNPOOLED set, plus --scratch-host <the unpooled host>.
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { SUPERUSER, createCluster, postgresTools, startCluster, stopCluster } from "../connections/local/database.mjs";

const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: { "scratch-host": { type: "string" } } });
const runtime = resolve(positionals[0] ?? "templates");
const require = createRequire(join(runtime, "package.json"));
const { build } = require("esbuild");
const local = await import(pathToFileURL(join(runtime, "scripts/local-database.mjs")));

// Suites converted to Postgres. It grows module by module until it is the full list again.
const converted = ["migrate"];
const scratchSuites = ["migrate", "query-route", "two-process"];

/** The scratch branch is taken only when the operator names the host and both URLs point at it. */
function scratchMode() {
  const host = flags["scratch-host"], { NEON_CHECK_URL: pooled, NEON_CHECK_URL_UNPOOLED: unpooled } = process.env;
  if (!host && !pooled && !unpooled) return false;
  if (!host || !pooled || !unpooled) throw new Error("The Neon check needs NEON_CHECK_URL, NEON_CHECK_URL_UNPOOLED and --scratch-host");
  const [first, ...rest] = host.split(".");
  if (new URL(unpooled).hostname !== host || new URL(pooled).hostname !== [`${first}-pooler`, ...rest].join("."))
    throw new Error("--scratch-host must be the unpooled URL's host, and the pooled URL's host that same host with -pooler");
  console.log(`Neon check on ${host}`);
  return true;
}

/**
 * One Postgres for the whole run, in its own folder under a known parent. Several worktrees run tests at once, so
 * clean only folders whose runner is dead, and stop a leftover server only after the folder check proved it.
 */
async function startPostgres() {
  const parent = join(tmpdir(), "gtm-test-postgres"), tools = await postgresTools(runtime);
  await mkdir(parent, { recursive: true });
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; } };
  for (const entry of await readdir(parent)) {
    const old = join(parent, entry), runner = Number(await readFile(join(old, "runner.pid"), "utf8").catch(() => NaN));
    if (Number.isInteger(runner) && alive(runner)) continue;
    if (await local.provenPort(old, { ...SUPERUSER, database: "postgres" })) stopCluster(tools, local.dataDirectory(old));
    await rm(old, { recursive: true, force: true }).catch(() => {});
  }
  const home = await mkdtemp(join(parent, "run-")), directory = local.dataDirectory(home);
  await writeFile(join(home, "runner.pid"), String(process.pid));
  await mkdir(dirname(directory), { recursive: true });
  createCluster(tools, directory);
  const port = await startCluster(tools, directory, join(home, "postgres.log"));
  if (!port) throw new Error(`The test Postgres did not start; see ${join(home, "postgres.log")}`);
  await local.ensureAppRole(port, SUPERUSER);
  return { port, async stop() { stopCluster(tools, directory); await rm(home, { recursive: true, force: true }).catch(() => {}); } };
}

const scratch = scratchMode();
const postgres = scratch ? null : await startPostgres();
const env = { ...process.env, GTM_TEST_RUNTIME: runtime, ...(scratch ? { GTM_TEST_SCRATCH: "1" } : { GTM_TEST_POSTGRES_PORT: String(postgres.port) }) };
for (const name of Object.keys(env)) if (/^(?:DATABASE_URL|PG|POSTGRES_)/.test(name) || name === "GTM_DATABASE") delete env[name];
// Template scripts stay outside the bundle: they find the template folder, and guard their command line, by their own URL.
const templateScripts = {
  name: "template-scripts",
  setup(build) {
    build.onResolve({ filter: /templates\/scripts\/[a-z-]+\.mjs$/ }, (args) => ({ path: pathToFileURL(join(runtime, "scripts", args.path.split("/").pop())).href, external: true }));
  },
};
const dir = await mkdtemp(join(tmpdir(), "gtm-data-tests-"));
try {
  await symlink(join(runtime, "node_modules"), join(dir, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const all = [
    "migrate",
    "profiles",
    "business",
    "linked-data",
    "workspace-data",
    "viewer-grants",
    "inspection",
    "viewer-api",
    "web-url",
    "reliability",
    "cli-mcp",
    "connections-management",
    "connections-platform",
    "connections-apply",
  ];
  for (const name of scratch ? scratchSuites : all.filter((suite) => converted.includes(suite))) {
    const outfile = join(dir, `${name}.test.mjs`);
    await build({
      entryPoints: [
        join(dirname(fileURLToPath(import.meta.url)), `${name}.test.ts`),
      ],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
      tsconfigRaw: { compilerOptions: {} },
      plugins: [templateScripts],
      ...(name === "reliability"
        ? {
            plugins: [
              templateScripts,
              {
                name: "workflow-test-context",
                setup(build) {
                  // Keep the CLI entrypoint guard tied to its original module URL.
                  build.onResolve({ filter: /scripts\/upgrade-package\.mjs$/ }, () => ({
                    path: join(dirname(fileURLToPath(import.meta.url)), "../scripts/upgrade-package.mjs"),
                    external: true,
                  }));
                  build.onResolve({ filter: /^workflow$/ }, () => ({
                    path: join(
                      dirname(fileURLToPath(import.meta.url)),
                      "reliability-fixture.ts",
                    ),
                  }));
                },
              },
            ],
          }
        : {}),
      ...(name === "viewer-api"
        ? {
            plugins: [
              templateScripts,
              {
                name: "isolated-viewer-adapters",
                setup(build) {
                  build.onResolve(
                    {
                      filter:
                        /^(#viewer-registry|workflow\/runtime|@workflow\/core\/serialization|\.\/db|\.\/runs-api|\.\.\/db\/tables)$/,
                    },
                    () => ({
                      path: join(
                        dirname(fileURLToPath(import.meta.url)),
                        "api-fixture.ts",
                      ),
                    }),
                  );
                },
              },
            ],
          }
        : {}),
    });
    const result = spawnSync(process.execPath, ["--test", outfile], {
      stdio: "inherit",
      env,
    });
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  }
} finally {
  await rm(dir, { recursive: true, force: true });
  await postgres?.stop();
}
