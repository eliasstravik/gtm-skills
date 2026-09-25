#!/usr/bin/env node
// Run from any checkout with an installed workflow runtime: node tests/run.mjs /path/to/workflows
// Neon check (by hand, never in CI): NEON_CHECK_URL and NEON_CHECK_URL_UNPOOLED set, plus --scratch-host <the unpooled host>.
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { startTestPostgres } from "./postgres.mjs";

const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: { "scratch-host": { type: "string" }, only: { type: "string", multiple: true } } });
const runtime = resolve(positionals[0] ?? "templates");
const require = createRequire(join(runtime, "package.json"));
const { build } = require("esbuild");

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

const scratch = scratchMode();
const postgres = scratch ? null : await startTestPostgres(runtime);
const env = { ...process.env, GTM_TEST_RUNTIME: runtime, ...(scratch ? { GTM_TEST_SCRATCH: "1" } : { GTM_TEST_POSTGRES_PORT: String(postgres.port) }) };
for (const name of Object.keys(env)) if (/^(?:DATABASE_URL|PG|POSTGRES_)/.test(name) || name === "GTM_DATABASE") delete env[name];
// Template scripts stay outside the bundle: they find the template folder, and guard their command line, by their own URL.
const templateScripts = {
  name: "template-scripts",
  setup(build) {
    // The skill's own scripts too: they guard their command line by their own URL.
    build.onResolve({ filter: /^\.\.\/scripts\/[a-z-]+\.mjs$/ }, (args) => ({ path: pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), args.path)).href, external: true }));
    build.onResolve({ filter: /templates\/scripts\/[a-z-]+\.mjs$/ }, (args) => ({ path: pathToFileURL(join(runtime, "scripts", args.path.split("/").pop())).href, external: true }));
  },
};
const dir = await mkdtemp(join(tmpdir(), "gtm-data-tests-"));
try {
  await symlink(join(runtime, "node_modules"), join(dir, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const all = [
    "migrate",
    "query-route",
    "two-process",
    "profiles",
    "store",
    "blitz",
    "network-workflow",
    "network-build",
    "rows-cache",
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
    "connections-local",
    "connections-platform",
    "share-intake",
    "connections-apply",
    "read-budgets",
    "bench-network",
  ];
  // --only <suite> (repeatable) runs a subset while working on one module.
  for (const name of (scratch ? scratchSuites : all).filter((suite) => !flags.only || flags.only.includes(suite))) {
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
      ...(["reliability", "rows-cache", "network-workflow"].includes(name)
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
                        /^(#viewer-registry|workflow\/runtime|@workflow\/core\/serialization|\.\/runs-api|\.\/tables)$/,
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
