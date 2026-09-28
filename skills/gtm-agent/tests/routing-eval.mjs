#!/usr/bin/env node
// Live routing eval: does a real Claude Code session load the gtm-agent skill
// for requests about the Slack agent, and leave it alone otherwise?
//
//   node skills/gtm-agent/tests/routing-eval.mjs [--skills <dir>] [--runs 3] [--model <alias>] [--only <text>] [--concurrency 4]
//
// Needs a signed-in `claude` CLI, so it is not part of CI. Each case runs in a
// temporary, read-only folder that holds only the skills from --skills (default: this
// repository's skills/), with user settings and user skills switched off.
// A case with `after` runs those turns first in the same session and judges
// only its last turn. A positive case passes when most runs call the Skill tool with gtm-agent;
// a negative case passes when most runs never do. Exit 1 on any failed case.
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const cases = [
  // t-0052: the user asked this and the skill was read by hand, never loaded.
  { expect: true, prompt: "Tell me about the Slack GTM agent: can you check whether I could set it up, and what exactly I'd need? Don't deploy or create anything." },
  // The trial's miss came mid-conversation, after another skill was in use and with
  // a chore first: the session read gtm-agent's files by hand instead of loading it.
  { expect: true, after: ["Which workflows could score the people in signups.csv against our personas? Three lines, don't build anything."],
    prompt: "Nice, turn signups.csv into a short summary in this folder too. Then tell me about the Slack GTM agent: can you check whether I could set it up, and what exactly I'd need? Don't deploy or create anything." },
  { expect: true, prompt: "can I set up the Slack GTM agent" },
  { expect: true, prompt: "What would it take to get a GTM bot into our Slack that the team can ask questions?" },
  { expect: true, prompt: "Is the Slack agent something I can try? What does it cost and what do I need?" },
  { expect: true, prompt: "Our Slack GTM agent stopped answering, can you check it?" },
  { expect: true, prompt: "deploy the GTM agent to our Slack" },
  { expect: false, prompt: "Add Sara to the team, she's our RevOps lead. We use HubSpot and Slack internally." },
  { expect: false, prompt: "Post a Slack message in #sales every time the inbound scoring workflow finishes." },
  { expect: false, prompt: "Take our workflows live on Vercel." },
  { expect: false, prompt: "Create an ICP for mid-size SaaS companies that use Slack." },
  { expect: false, prompt: "Is acme.com a fit for our ICP?" },
];

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1];
};
const here = dirname(fileURLToPath(import.meta.url));
const skillsDir = resolve(flag("--skills", join(here, "..", "..")));
const runs = Number(flag("--runs", "3"));
const model = flag("--model", undefined);
const only = flag("--only", undefined);
const concurrency = Number(flag("--concurrency", "4"));

// Runs one turn in dir, resuming session when given; returns its session id and
// the skills that turn loaded through the Skill tool.
function turn(dir, prompt, session) {
  // Read-only: the session can look around and load skills, never run or write.
  const cli = ["-p", prompt, "--setting-sources", "project", "--permission-mode", "default",
    "--disallowedTools", "Bash,Write,Edit,NotebookEdit,Agent", "--allowedTools", "Read,Glob,Grep,Skill",
    "--output-format", "stream-json", "--verbose", "--max-turns", "6"];
  if (session) cli.push("--resume", session);
  if (model) cli.push("--model", model);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("CLAUDE") || key.startsWith("HERDR")) delete env[key];
  return new Promise((done, fail) => {
    const child = spawn("claude", cli, { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", chunk => (out += chunk));
    child.stderr.on("data", chunk => (err += chunk));
    child.on("error", fail);
    child.on("close", () => {
      const loaded = [];
      let id;
      for (const line of out.split("\n")) {
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event.type === "result") id = event.session_id;
        for (const part of event.message?.content ?? [])
          if (part.type === "tool_use" && part.name === "Skill") loaded.push(String(part.input?.skill ?? part.input?.command ?? ""));
      }
      if (!id) fail(new Error(`claude did not finish: ${err.trim().slice(0, 300)}`));
      else done({ id, loaded });
    });
  });
}

// Returns the skills the case's last turn loaded, after any earlier turns.
async function route(c) {
  const dir = mkdtempSync(join(tmpdir(), "gtm-routing-"));
  try {
    for (const name of readdirSync(skillsDir))
      if (existsSync(join(skillsDir, name, "SKILL.md")))
        cpSync(join(skillsDir, name), join(dir, ".claude", "skills", name), { recursive: true });
    writeFileSync(join(dir, "signups.csv"), "email,company\nana@quillhr.com,QuillHR\nbo@acme.com,Acme\n");
    let session;
    for (const earlier of c.after ?? []) session = (await turn(dir, earlier, session)).id;
    return (await turn(dir, c.prompt, session)).loaded;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function pool(jobs, size) {
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, async () => {
    while (next < jobs.length) {
      const at = next++;
      results[at] = await jobs[at]();
    }
  }));
  return results;
}

const selected = cases.filter(c => !only || c.prompt.includes(only));
const jobs = selected.flatMap(c => Array.from({ length: runs }, () => () => route(c)));
const loads = await pool(jobs, concurrency);
let failed = 0;
selected.forEach((c, index) => {
  const mine = loads.slice(index * runs, (index + 1) * runs);
  const hits = mine.filter(loaded => loaded.some(name => name.replace(/^\//, "").endsWith("gtm-agent"))).length;
  const ok = c.expect ? hits * 2 > runs : hits * 2 < runs;
  if (!ok) failed++;
  const seen = mine.map(loaded => loaded.join("+") || "none").join(", ");
  console.log(`${ok ? "pass" : "FAIL"}  ${c.expect ? "loads   " : "skips   "} gtm-agent ${hits}/${runs}  [${seen}]  ${c.prompt}`);
});
console.log(`${selected.length - failed}/${selected.length} cases passed (skills from ${skillsDir})`);
process.exit(failed ? 1 : 0);
