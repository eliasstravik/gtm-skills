// Doctor smoke test: runs every check against fake `gh` and `vercel` commands, so a check that throws (as a
// leftover reference once did) fails here instead of in front of a user.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fake = `#!/usr/bin/env node
const args = process.argv.slice(2), tool = process.argv[1].split("/").pop();
const out = (value) => { process.stdout.write(JSON.stringify(value)); process.exit(0); };
if (tool === "gh") out({ name: "x" });
if (args[0] === "env" && args[1] === "run") { console.log(JSON.stringify({ status: 200, ok: true, scopes: [] })); process.exit(0); }
if (args[0] !== "api") out({});
const path = args[1];
const agent = { id: "prj_agent", name: "gtm-agent-acme", accountId: "team_1", framework: "eve", previewDeploymentsDisabled: true, link: { repo: "gtm-agent-acme" } };
const runtime = { id: "prj_runtime", name: "gtm-acme", accountId: "team_1", framework: "nitro", rootDirectory: "workflows", nodeVersion: "22.x",
  autoExposeSystemEnvs: true, previewDeploymentsDisabled: true, commandForIgnoringBuildStep: null, ssoProtection: { deploymentType: "all" },
  link: { repo: "gtm-acme", org: "acme" }, protectionBypass: { s: { scope: "automation-bypass", isEnvVar: true } }, trustedSources: { projects: {} } };
if (/^\\/v9\\/projects\\/(gtm-agent-acme|prj_agent)$/.test(path)) out(agent);
if (/^\\/v9\\/projects\\/(gtm-acme|prj_runtime)$/.test(path)) out(runtime);
if (/\\/v9\\/projects\\/[^/]+$/.test(path)) { process.stderr.write("Error: Project not found. (404)"); process.exit(1); }
if (/\\/env/.test(path)) out({ envs: [{ id: "e1", key: "GTM_WORKFLOW_URL", target: ["production"], type: "plain", value: "https://gtm-acme.vercel.app" }] });
if (/\\/domains/.test(path)) out({ domains: [{ name: "gtm-acme.vercel.app", verified: true }] });
if (/deployments/.test(path)) out({ deployments: [] });
if (/connectors/.test(path)) out({ clients: [] });
out({});
`;

test("doctor runs every check, including the workflow project, without throwing", async () => {
  const bin = await mkdtemp(join(tmpdir(), "gtm-doctor-bin-"));
  try {
    for (const name of ["gh", "vercel"]) { await writeFile(join(bin, name), fake); await chmod(join(bin, name), 0o755); }
    process.env.PATH = `${bin}:${process.env.PATH}`;
    const { check } = await import("../scripts/doctor.mjs");
    const results = await check({ slug: "acme", team: "acme", githubOwner: "acme" });
    const names = results.map((row) => row.name);
    assert.ok(names.includes("Agent project exists"));
    assert.ok(names.some((name) => /Agent has GTM_WORKFLOW_URL/.test(name)), names.join("\n"));
    assert.ok(names.includes("Agent reaches the workflow project's agent-only routes"));
    for (const row of results.filter((row) => !row.ok)) assert.ok(row.fix, `${row.name} names a fix`);
    assert.ok(!results.some((row) => /run setup\.mjs \(it scaffolds/.test(row.fix)), "no circular fixes");
  } finally { await rm(bin, { recursive: true, force: true }); }
});
