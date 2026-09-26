// `npm run dev` with a `.env.local` as `vercel env pull` writes it stays local: node tests/local-launch.mjs <runtime>.
// Starts the real launcher over a copy of the template (its own Postgres in the copy's data/pg) and asks a route
// handler and nitro.config.ts what they saw.
import assert from "node:assert/strict";
import { cp, mkdir, readdir, readFile, rm, symlink, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const runtime = resolve(process.argv[2] ?? "templates");
const dir = await mkdtemp(join(tmpdir(), "gtm-local-launch-"));
const PORT = 3944, origin = `http://127.0.0.1:${PORT}`;
for (const name of await readdir(runtime))
  if (!["node_modules", ".output", ".nitro", "public", "data", ".env.local", ".env", ".vercel"].includes(name)) await cp(join(runtime, name), join(dir, name), { recursive: true });
await mkdir(join(dir, "node_modules"));
for (const name of await readdir(join(runtime, "node_modules")))
  if (!name.startsWith(".") || name === ".bin") await symlink(join(runtime, "node_modules", name), join(dir, "node_modules", name));

// The shape `vercel env pull` writes: system variables, empty git ones, the OIDC token, then the project's own.
await writeFile(join(dir, ".env.local"), `# Created by Vercel CLI
VERCEL="1"
VERCEL_ENV="development"
VERCEL_TARGET_ENV="development"
VERCEL_URL=""
VERCEL_PROJECT_ID="prj_pulled"
VERCEL_GIT_COMMIT_SHA=""
VERCEL_GIT_COMMIT_REF=""
VERCEL_GIT_PROVIDER=""
VERCEL_OIDC_TOKEN="header.payload.signature"
APOLLO_API_KEY="sk-local"
PGHOST="db.invalid"
`);
await writeFile(join(dir, "server/api/env-probe.get.ts"), `import { defineHandler } from "nitro";
export default defineHandler(() => ({ vercel: process.env.VERCEL ?? null, env: process.env.VERCEL_ENV ?? null, git: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  project: process.env.VERCEL_PROJECT_ID ?? null, oidc: Boolean(process.env.VERCEL_OIDC_TOKEN), apollo: process.env.APOLLO_API_KEY === "sk-local", pghost: process.env.PGHOST ?? null, recover: process.env.WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS ?? null }));
`);
const config = join(dir, "nitro.config.ts");
await writeFile(config, (await readFile(config, "utf8")).replace('import "./lib/local-runtime";', 'import "./lib/local-runtime";\nimport { writeFileSync } from "node:fs";\nwriteFileSync("config-env.json", JSON.stringify({ vercel: process.env.VERCEL ?? null }));'));

const child = spawn(process.execPath, ["scripts/local-launch.mjs"], { cwd: dir, env: { PATH: process.env.PATH, HOME: process.env.HOME, GTM_RUNTIME_PORT: String(PORT), ...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}) }, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
const exited = new Promise((resolve) => child.on("exit", resolve));
const get = (path) => fetch(`${origin}${path}`).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));
try {
  let probe;
  for (let attempt = 0; attempt < 240 && !probe; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (child.exitCode !== null) throw Error(`the launcher exited:\n${output}`);
    probe = await get("/api/env-probe").then((reply) => reply.status === 200 ? reply.body : null, () => null);
  }
  assert.ok(probe, `the dev server did not answer:\n${output}`);
  assert.deepEqual(probe, { vercel: null, env: null, git: null, project: null, oidc: true, apollo: true, pghost: null, recover: "true" });
  assert.deepEqual(JSON.parse(await readFile(join(dir, "config-env.json"), "utf8")), { vercel: null });
  // Local mode throughout: the local Keys page and the local key list, no hosted commit.
  const link = await get("/api/link");
  assert.equal(link.status, 200);
  assert.equal(link.body.connectionsUrl, `${origin}/connections`);
  assert.equal(link.body.commit, null);
  assert.deepEqual(link.body.keys, ["APOLLO_API_KEY"]);
  const keys = await get("/api/connection-management");
  assert.equal(keys.body.mode, "local");
  console.log("local launch stays local with a pulled .env.local");
} finally {
  child.kill("SIGTERM");
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 30000))]);
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
