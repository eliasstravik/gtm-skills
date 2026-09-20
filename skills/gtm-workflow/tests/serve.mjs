import { mkdtemp, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { startTestPostgres } from "./postgres.mjs";
const runtime = resolve(process.argv[2] ?? "templates"),
  tests = dirname(fileURLToPath(import.meta.url));
const { build } = createRequire(join(runtime, "package.json"))("esbuild");
const dir = await mkdtemp(join(tmpdir(), "gtm-browser-fixture-"));
await symlink(join(runtime, "node_modules"), join(dir, "node_modules"));
await build({
  entryPoints: [join(tests, "browser-fixture.ts")],
  outfile: join(dir, "server.mjs"),
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  tsconfigRaw: { compilerOptions: {} },
  plugins: [
    {
      name: "isolated-viewer-adapters",
      setup(build) {
        build.onResolve(
          {
            filter:
              /^(#viewer-registry|workflow\/runtime|@workflow\/core\/serialization|\.\/runs-api|\.\/tables)$/,
          },
          () => ({ path: join(tests, "api-fixture.ts") }),
        );
        // Template scripts locate the template by their own URL, so they stay outside the bundle.
        build.onResolve({ filter: /templates\/scripts\/[a-z-]+\.mjs$/ }, (args) => ({ path: pathToFileURL(join(runtime, "scripts", args.path.split("/").pop())).href, external: true }));
      },
    },
  ],
});
// The fixture uses the real lib/db.ts on its own Postgres, like the suites in run.mjs.
const postgres = await startTestPostgres(runtime);
const env = { ...process.env, GTM_TEST_RUNTIME: runtime, GTM_TEST_POSTGRES_PORT: String(postgres.port) };
for (const name of Object.keys(env)) if (/^(?:DATABASE_URL|PG|POSTGRES_)/.test(name) || name === "GTM_DATABASE") delete env[name];
const child = spawn(
  process.execPath,
  [join(dir, "server.mjs"), join(runtime, "public")],
  { stdio: "inherit", env },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));

child.on("exit", async (code) => {
  await rm(dir, { recursive: true, force: true });
  await postgres.stop();
  process.exit(code ?? 0);
});
