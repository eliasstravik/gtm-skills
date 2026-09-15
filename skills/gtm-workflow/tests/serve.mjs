import { mkdtemp, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
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
              /^(#viewer-registry|workflow\/runtime|@workflow\/core\/serialization|\.\/db|\.\/runs-api|\.\.\/db\/tables)$/,
          },
          () => ({ path: join(tests, "api-fixture.ts") }),
        );
      },
    },
  ],
});
const child = spawn(
  process.execPath,
  [join(dir, "server.mjs"), join(runtime, "public")],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));

child.on("exit", async (code) => {
  await rm(dir, { recursive: true, force: true });
  process.exit(code ?? 0);
});
