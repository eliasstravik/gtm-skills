#!/usr/bin/env node
// Run from any checkout with an installed workflow runtime: node tests/run.mjs /path/to/workflows
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const runtime = resolve(process.argv[2] ?? "templates");
const require = createRequire(join(runtime, "package.json"));
const { build } = require("esbuild");
const dir = await mkdtemp(join(tmpdir(), "gtm-data-tests-"));
try {
  await symlink(join(runtime, "node_modules"), join(dir, "node_modules"));
  for (const name of [
    "linked-data",
    "viewer-grants",
    "inspection",
    "viewer-api",
  ]) {
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
      ...(name === "viewer-api"
        ? {
            plugins: [
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
    });
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}
