import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Rate limits on the public gtm-<ws>-share project, from one definition in the template. Setup applies them, Doctor
// compares them, and a hosted upgrade applies them again. Only rules named with the prefix belong to the template; any
// other rule on the project is the owner's and is left alone. Traffic the firewall answers with 429 is not billed.
const skill = dirname(dirname(fileURLToPath(import.meta.url)));
export const RULE_PREFIX = "GTM share: ";
export const shareFirewallRules = () => JSON.parse(readFileSync(join(skill, "templates/share-firewall.json"), "utf8")).rules;

/** Runs the Vercel CLI and returns its JSON output, or `null` for a 404. The CLI may print a hint line for agents first. */
export function vercelCli(args) {
  const result = spawnSync("vercel", [...args, "--non-interactive"], { encoding: "utf8", stdio: "pipe", maxBuffer: 8 * 1024 * 1024 });
  const out = (result.stdout ?? "").split("\n").filter((line) => !line.startsWith("<claude-code-hint")).join("\n").trim();
  if (result.status !== 0) {
    if (/\(404\)/.test(result.stderr ?? "")) return null;
    throw Object.assign(Error(`vercel ${args.slice(0, 3).join(" ")} failed`), { code: "vercel_command_failed" });
  }
  if (args[0] !== "api") return out;
  try { return JSON.parse(out); } catch { throw Object.assign(Error("Vercel returned no JSON"), { code: "invalid_vercel_response" }); }
}

// Vercel stores rules with its own id and validity fields and in its own key order; compare only what the template sets.
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonical(value[key])]))
  : value;
const shape = ({ name, description, active, conditionGroup, action }) => canonical({ name, description, active, conditionGroup, action });
export const sameRule = (live, wanted) => JSON.stringify(shape(live)) === JSON.stringify(shape(wanted));

/** What to change so the project's template-owned rules match `wanted`: rules to add, rules to replace by id, rules to remove. */
export function firewallPlan(live, wanted = shareFirewallRules()) {
  const ours = live.filter((rule) => rule.name?.startsWith(RULE_PREFIX));
  const add = [], update = [];
  for (const rule of wanted) {
    const current = ours.find((row) => row.name === rule.name);
    if (!current) add.push(rule);
    else if (!sameRule(current, rule)) update.push({ id: current.id, rule });
  }
  const remove = ours.filter((row) => !wanted.some((rule) => rule.name === row.name)).map((row) => row.id);
  return { add, update, remove };
}

const scope = (project, team) => ["--project", project, "--scope", team];
const liveConfig = (cli, project, team) => cli(["api", `/v1/security/firewall/config/active?projectId=${encodeURIComponent(project)}`, "--raw", "--scope", team]);

/** Compares the share project's live rules with the template, for Doctor: `current`, `missing` rules, `differs`, or no project. */
export function shareFirewallDrift({ project, team, cli = vercelCli }) {
  if (!cli(["api", `/v9/projects/${encodeURIComponent(project)}`, "--raw", "--scope", team])) return { project, status: "no_share_project" };
  const config = liveConfig(cli, project, team);
  const { add, update, remove } = firewallPlan(config?.firewallEnabled ? config.rules ?? [] : []);
  const status = add.length ? "missing" : update.length || remove.length ? "differs" : "current";
  return { project, status, ...(status === "current" ? {} : { missing: add.map((rule) => rule.name), differs: [...update.map((row) => row.rule.name), ...remove] }) };
}

/**
 * Brings the share project's template-owned rules in line with the template and publishes them. Idempotent: a project
 * that already matches is not touched. A draft someone else left unpublished stops it, so it never publishes their edits.
 */
export function applyShareFirewall({ project, team, cli = vercelCli }) {
  if (!cli(["api", `/v9/projects/${encodeURIComponent(project)}`, "--raw", "--scope", team])) return { project, status: "no_share_project" };
  const draft = cli(["api", `/v1/security/firewall/config/draft?projectId=${encodeURIComponent(project)}`, "--raw", "--scope", team]);
  if (draft?.changes?.length) return { project, status: "draft_pending", instruction: `Publish or discard the pending firewall draft first: vercel firewall diff ${scope(project, team).join(" ")}` };
  const config = liveConfig(cli, project, team);
  const plan = firewallPlan(config?.firewallEnabled ? config.rules ?? [] : []);
  if (!plan.add.length && !plan.update.length && !plan.remove.length) return { project, status: "current" };
  for (const rule of plan.add) cli(["firewall", "rules", "add", "--json", JSON.stringify(rule), ...scope(project, team), "--yes"]);
  for (const { id, rule } of plan.update) cli(["firewall", "rules", "edit", id, "--json", JSON.stringify(rule), ...scope(project, team), "--yes"]);
  for (const id of plan.remove) cli(["firewall", "rules", "remove", id, ...scope(project, team), "--yes"]);
  cli(["firewall", "publish", ...scope(project, team), "--yes"]);
  const after = shareFirewallDrift({ project, team, cli });
  return { project, status: after.status === "current" ? "applied" : "apply_incomplete", added: plan.add.map((rule) => rule.name), updated: plan.update.map((row) => row.rule.name), removed: plan.remove };
}

/**
 * The team's Spend Management budget, read only. Vercel documents no API for it; this is the endpoint its dashboard reads,
 * so an unreadable answer is `unknown`, never an error. Setup and Doctor warn when no active team budget pauses projects.
 */
export function teamSpendCap({ team, cli = vercelCli }) {
  try {
    const id = cli(["api", `/v2/teams/${encodeURIComponent(team)}`, "--raw", "--scope", team])?.id;
    const budgets = id && cli(["api", `/v1/budgets?teamId=${encodeURIComponent(id)}`, "--raw", "--scope", team])?.data;
    if (!Array.isArray(budgets)) return { team, status: "unknown" };
    const budget = budgets.find((row) => row.scope === "team" && row.status === "active");
    if (!budget) return { team, status: "off", warning: `Team ${team} has no spend cap. Add one under Settings > Billing > Spend Management, with Pause on.` };
    const pauses = budget.thresholds?.some((row) => row.pauseUsage) ?? false;
    return { team, status: "on", amountUsd: Number(budget.amount), pauses,
      ...(pauses ? {} : { warning: `Team ${team}'s $${budget.amount} budget only alerts. Turn on Pause so a flood cannot keep spending.` }) };
  } catch { return { team, status: "unknown" }; }
}
