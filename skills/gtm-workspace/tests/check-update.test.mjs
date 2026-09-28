// The once-per-conversation update check (references/updates.md): versions, the prompt decision, the hosted path,
// silence when offline, the migration kinds Doctor reports, and the release rule that keeps every version equal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  agentSkillsPin, checkForUpdate, compareVersions, decide, installedVersion, isGlobal, latestVersion, skillVersion,
} from "../scripts/check-update.mjs";
import { migrationFor } from "../../gtm-workflow/scripts/doctor.mjs";

const skills = fileURLToPath(new URL("../../", import.meta.url));
const skillMd = (version) => `---\nname: gtm-x\ndescription: Triggers when.\n${version ? `metadata:\n  version: "${version}"\n` : ""}---\n\n# X\n`;

async function folder(files) {
  const dir = await mkdtemp(join(tmpdir(), "gtm-update-"));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  return dir;
}

test("every gtm skill and the workflow template carry the same release version", async () => {
  const template = JSON.parse(await readFile(join(skills, "gtm-workflow/templates/package.json"), "utf8")).version;
  const names = (await readdir(skills)).filter((name) => name.startsWith("gtm-"));
  assert.ok(names.length >= 6, names.join());
  for (const name of names) {
    const text = await readFile(join(skills, name, "SKILL.md"), "utf8");
    assert.equal(skillVersion(text), template, `${name}/SKILL.md metadata.version must be ${template} (references/updates.md#releasing)`);
    assert.match(text, /\]\((?:\.\.\/gtm-workspace\/)?references\/updates\.md\)/, `${name}/SKILL.md links the update check`);
  }
});

test("reads metadata.version from frontmatter only", () => {
  assert.equal(skillVersion(skillMd("1.2.3")), "1.2.3");
  assert.equal(skillVersion("---\nname: a\nmetadata:\n  owner: x\n  version: 0.3.1\n---\n"), "0.3.1");
  assert.equal(skillVersion(skillMd(null)), null);
  assert.equal(skillVersion(`${skillMd(null)}\nmetadata:\n  version: "9.9.9"\n`), null, "the body is not frontmatter");
  assert.equal(compareVersions("0.2.0", "0.10.0"), -1);
  assert.equal(compareVersions(null, "0.0.1"), -1);
});

test("the withdrawn 0.3.0 counts as 0.2.0, so it is offered 0.2.1", () => {
  assert.equal(compareVersions("0.3.0", "0.2.1"), -1);
  assert.equal(compareVersions("0.3.0", "0.2.0"), 0);
  assert.deepEqual(decide({ installed: "0.3.0", latest: "0.2.1" }),
    { status: "update_available", installed: "0.3.0", latest: "0.2.1", command: "npx skills add eliasstravik/gtm-skills -g -y" });
});

test("the installed version is the lowest gtm skill, so a half-updated install counts as old", async () => {
  const dir = await folder({
    "gtm-workspace/SKILL.md": skillMd("0.3.0"), "gtm-icp/SKILL.md": skillMd("0.2.0"), "other/SKILL.md": skillMd("0.0.1"),
  });
  try {
    assert.equal(installedVersion(dir), "0.2.0");
    await mkdir(join(dir, "gtm-persona"));
    await writeFile(join(dir, "gtm-persona", "SKILL.md"), skillMd(null));
    assert.equal(installedVersion(dir), "0.0.0", "a gtm skill from before versions is the oldest");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("asks only when the latest release is newer, and says how to install it", () => {
  assert.deepEqual(decide({ installed: "0.2.0", latest: "0.2.0" }), { status: "current", installed: "0.2.0" });
  assert.deepEqual(decide({ installed: "0.3.0", latest: "0.2.0" }), { status: "current", installed: "0.3.0" });
  assert.deepEqual(decide({ installed: "0.2.0", latest: "0.2.1" }),
    { status: "update_available", installed: "0.2.0", latest: "0.2.1", command: "npx skills add eliasstravik/gtm-skills -g -y" });
  assert.equal(decide({ installed: "0.2.0", latest: "0.2.1", global: false }).command, "npx skills add eliasstravik/gtm-skills -y");
  assert.deepEqual(decide({ installed: "0.2.0", latest: "0.2.1", hosted: true }),
    { status: "update_available", installed: "0.2.0", latest: "0.2.1", hosted: true }, "the Slack agent gets no command");
  assert.deepEqual(decide({ installed: "0.2.0", latest: null }), { status: "unknown" });
});

test("global installs live in a dot folder of the home directory", () => {
  assert.equal(isGlobal("/home/u/.agents/skills", "/home/u"), true);
  assert.equal(isGlobal("/home/u/.config/opencode/skills", "/home/u"), true);
  assert.equal(isGlobal("/home/u/dev/acme/.agents/skills", "/home/u"), false);
  assert.equal(isGlobal("/home/u/.gtm/acme/.agents/skills", "/home/u"), false);
  assert.equal(isGlobal("/srv/app/.agents/skills", "/home/u"), false);
});

test("the latest release is gtm-skills main on a computer and the agent template's pin on the Slack agent", async () => {
  const pin = "f928df090436fa2b49ad758f4c24a17c4430f245";
  const agentPackage = JSON.stringify({ scripts: { build: `rm -rf agent/skills && npx skills@1.5.26 add eliasstravik/gtm-skills#${pin} --subagent root -y && eve build` } });
  assert.equal(agentSkillsPin(agentPackage), pin);
  assert.equal(agentSkillsPin("{}"), null);
  const seen = [];
  const get = async (url) => {
    seen.push(url);
    if (url.endsWith("/eliasstravik/gtm-agent/main/package.json")) return agentPackage;
    if (url.endsWith(`/eliasstravik/gtm-skills/${pin}/skills/gtm-workspace/SKILL.md`)) return skillMd("0.2.1");
    if (url.endsWith("/eliasstravik/gtm-skills/main/skills/gtm-workspace/SKILL.md")) return skillMd("0.3.0");
    throw new Error(`unexpected ${url}`);
  };
  assert.equal(await latestVersion({ get }), "0.3.0");
  assert.equal(await latestVersion({ hosted: true, get }), "0.2.1");
  assert.ok(seen.every((url) => url.startsWith("https://raw.githubusercontent.com/")), seen.join("\n"));
});

test("offline, broken or switched off: no prompt", async () => {
  const dir = await folder({ "gtm-workspace/SKILL.md": skillMd("0.2.0") });
  try {
    const offline = async () => { throw new TypeError("fetch failed"); };
    assert.deepEqual(await checkForUpdate({ dir, env: {}, get: offline }), { status: "unknown" });
    assert.deepEqual(await checkForUpdate({ dir, env: {}, get: async () => "<html>rate limited</html>" }), { status: "unknown" });
    assert.deepEqual(await checkForUpdate({ dir, env: { GTM_SKIP_UPDATE_CHECK: "1" }, get: offline }), { status: "skipped" });
    const newer = await checkForUpdate({ dir, env: {}, get: async () => skillMd("0.2.1") });
    assert.equal(newer.status, "update_available");
    assert.equal(newer.latest, "0.2.1");
    const hosted = await checkForUpdate({ dir, env: { GTM_AGENT_HOSTED: "1" }, get: async (url) =>
      url.endsWith("package.json") ? JSON.stringify({ scripts: { build: "npx skills add eliasstravik/gtm-skills#abcdef1 -y" } }) : skillMd("0.2.1") });
    assert.equal(hosted.hosted, true);
    assert.equal(hosted.command, undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Doctor names the migration an older workspace needs", async () => {
  const dir = await folder({ "a/package.json": "{}", "b/scripts/gtm.ts": "", "c/db/tables/cache.ts": "" });
  try {
    assert.equal(migrationFor(join(dir, "a"), "0.2.0", "0.2.0"), null);
    assert.equal(migrationFor(join(dir, "a"), null, "0.2.0"), null, "no runtime yet is setup, not a migration");
    assert.deepEqual(migrationFor(join(dir, "a"), "0.1.63", "0.2.0"), { kind: "template", from: "0.1.63", to: "0.2.0" });
    assert.deepEqual(migrationFor(join(dir, "a"), "0.4.0", "0.2.1"), { kind: "skills_behind", from: "0.4.0", to: "0.2.1" });
    assert.deepEqual(migrationFor(join(dir, "a"), "0.3.0", "0.2.1"), { kind: "template", from: "0.3.0", to: "0.2.1" }, "the withdrawn 0.3.0 moves to 0.2.1");
    assert.equal(migrationFor(join(dir, "b"), "0.0.9", "0.2.0").kind, "previous_runtime");
    assert.equal(migrationFor(join(dir, "c"), "0.1.40", "0.2.0").kind, "earlier_database");
    const guide = await readFile(join(skills, "gtm-workspace/references/updates.md"), "utf8");
    for (const kind of ["template", "earlier_database", "previous_runtime", "skills_behind"]) assert.match(guide, new RegExp(`\`${kind}\``), `updates.md explains ${kind}`);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
