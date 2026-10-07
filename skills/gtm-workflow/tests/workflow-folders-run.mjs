// Isolated local-only folder suite; uses an installed runtime for dependencies and migration scripts.
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { startTestPostgres } from "./postgres.mjs";
const runtime = resolve(process.argv[2]), here = dirname(fileURLToPath(import.meta.url));
const { build } = createRequire(join(runtime, "package.json"))("esbuild");
const postgres = await startTestPostgres(runtime), dir = await mkdtemp(join(tmpdir(), "gtm-folders-tests-"));
try {
  await symlink(join(runtime, "node_modules"), join(dir, "node_modules"));
  const outfile = join(dir, "folders.test.mjs");
  await build({ entryPoints: [join(here, "workflow-folders.test.ts")], outfile, bundle: true, platform: "node", format: "esm", packages: "external", tsconfigRaw: { compilerOptions: {} }, plugins: [{ name: "folder-fixtures", setup(build) {
    build.onResolve({ filter: /templates\/scripts\/[a-z-]+\.mjs$/ }, (args) => ({ path: pathToFileURL(join(runtime, "scripts", args.path.split("/").pop())).href, external: true }));
    build.onResolve({ filter: /^\.\/navigation$/ }, () => ({ path: join(here, "workflow-folders-navigation.ts") }));
    build.onResolve({ filter: /^(#viewer-registry|workflow\/runtime|@workflow\/core\/serialization|\.\/runs-api|\.\/tables)$/ }, () => ({ path: join(here, "api-fixture.ts") }));
  } }] });
  const env = { ...process.env, GTM_TEST_RUNTIME: runtime, GTM_TEST_POSTGRES_PORT: String(postgres.port) };
  for (const name of Object.keys(env)) if (/^(DATABASE_URL|PG|POSTGRES_|NEON_CHECK_)/.test(name) || ["GTM_TEST_SCRATCH", "VERCEL", "GTM_VIEWER_TAILNET_ORIGIN", "GTM_VIEWER_TAILNET_OWNER"].includes(name)) delete env[name];
  const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit", env });
  process.exitCode = result.status ?? 1;
} finally { await postgres.stop(); await rm(dir, { recursive: true, force: true }); }
