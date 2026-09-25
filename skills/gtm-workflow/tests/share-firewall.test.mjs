// Rate limits on the public share project: the template's rules, how setup applies them and how Doctor reports drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RULE_PREFIX, applyShareFirewall, firewallPlan, shareFirewallDrift, shareFirewallRules, teamSpendCap } from "../scripts/share-firewall.mjs";

// A stand-in for the Vercel CLI holding one project's live rules and draft, recording every command.
function fakeVercel({ rules = [], draft = null, project = true, budgets = [] } = {}) {
  const state = { live: structuredClone(rules), staged: null, calls: [] };
  let next = 0;
  const cli = (args) => {
    state.calls.push(args.slice(0, 3).join(" "));
    const [command, path] = args;
    if (command === "api") {
      if (path.startsWith("/v9/projects/")) return project ? { id: "prj_share" } : null;
      if (path.includes("/config/draft")) return draft;
      if (path.includes("/config/active")) return state.live.length ? { firewallEnabled: true, rules: state.live } : null;
      if (path.startsWith("/v2/teams/")) return { id: "team_1" };
      if (path.startsWith("/v1/budgets")) return { data: budgets };
      throw Error(path);
    }
    state.staged ??= structuredClone(state.live);
    const at = (id) => state.staged.findIndex((row) => row.id === id);
    const json = () => JSON.parse(args[args.indexOf("--json") + 1]);
    if (args[2] === "add") state.staged.push({ ...json(), id: `rule_${next++}`, valid: true });
    else if (args[2] === "edit") state.staged[at(args[3])] = { ...json(), id: args[3], valid: true };
    else if (args[2] === "remove") state.staged.splice(at(args[3]), 1);
    else if (args[1] === "publish") { state.live = state.staged; state.staged = null; }
    return "";
  };
  return { cli, state };
}
const target = { project: "gtm-acme-share", team: "acme" };

test("every template rule is a per-IP fixed-window limit the Pro plan allows, answering 429", () => {
  const rules = shareFirewallRules();
  assert.ok(rules.length >= 1 && rules.length <= 40);
  assert.equal(new Set(rules.map((rule) => rule.name)).size, rules.length);
  for (const rule of rules) {
    assert.ok(rule.name.startsWith(RULE_PREFIX), rule.name);
    assert.ok(rule.description.length <= 256, rule.name);
    const { action, rateLimit } = rule.action.mitigate;
    assert.equal(action, "rate_limit");
    assert.deepEqual([rateLimit.algo, rateLimit.keys, rateLimit.action], ["fixed_window", ["ip"], "rate_limit"]);
    assert.ok(rateLimit.window >= 10 && rateLimit.window <= 600 && rateLimit.limit >= 60, rule.name);
  }
  // The intake relay and the share page each have their own limit, and the catch-all never counts their paths twice.
  const catchAll = rules.find((rule) => rule.conditionGroup[0].conditions.every((condition) => condition.neg));
  const prefixes = rules.filter((rule) => rule !== catchAll).map((rule) => rule.conditionGroup[0].conditions[0].value);
  assert.ok(prefixes.includes("/api/intake/") && prefixes.includes("/api/viewer"));
  assert.deepEqual(catchAll.conditionGroup[0].conditions.map((condition) => condition.value).sort(), prefixes.sort());
});

test("a project without rules gets all of them, published once", () => {
  const { cli, state } = fakeVercel();
  assert.equal(shareFirewallDrift({ ...target, cli }).status, "missing");
  const result = applyShareFirewall({ ...target, cli });
  assert.equal(result.status, "applied");
  assert.deepEqual(result.added, shareFirewallRules().map((rule) => rule.name));
  assert.equal(state.calls.filter((call) => call === "firewall publish --project").length, 1);
  assert.deepEqual(shareFirewallDrift({ ...target, cli }), { project: target.project, status: "current" });
});

test("applying again changes nothing; a changed or retired template rule is repaired; the owner's own rules stay", () => {
  const [first, ...rest] = shareFirewallRules();
  const loosened = structuredClone(first); loosened.action.mitigate.rateLimit.limit = 100000;
  const ownRule = { id: "rule_own", name: "Block a crawler", active: true, conditionGroup: [], action: { mitigate: { action: "deny" } } };
  const live = [{ ...loosened, id: "rule_a" }, ...rest.map((rule, i) => ({ ...rule, id: `rule_r${i}`, valid: true, validationErrors: null })),
    { ...rest[0], id: "rule_old", name: `${RULE_PREFIX}retired` }, ownRule];
  assert.deepEqual(firewallPlan(live), { add: [], update: [{ id: "rule_a", rule: first }], remove: ["rule_old"] });
  const { cli, state } = fakeVercel({ rules: live });
  assert.deepEqual(shareFirewallDrift({ ...target, cli }), { project: target.project, status: "differs", missing: [], differs: [first.name, "rule_old"] });
  assert.equal(applyShareFirewall({ ...target, cli }).status, "applied");
  assert.ok(state.live.some((rule) => rule.id === "rule_own"));
  const before = state.calls.length;
  assert.deepEqual(applyShareFirewall({ ...target, cli }), { project: target.project, status: "current" });
  assert.ok(!state.calls.slice(before).some((call) => call.startsWith("firewall")));
});

test("Vercel's key order and extra fields do not count as drift", () => {
  const rule = shareFirewallRules()[0];
  const reverse = (value) => Array.isArray(value) ? value.map(reverse) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, inner]) => [key, reverse(inner)])) : value;
  const reordered = reverse(rule);
  assert.deepEqual(firewallPlan([{ ...reordered, id: "rule_x", valid: true, validationErrors: null }], [rule]), { add: [], update: [], remove: [] });
});

test("someone else's unpublished draft is never published, and a missing share project is skipped", () => {
  const pending = fakeVercel({ draft: { changes: [{ action: "rules.insert" }] } });
  assert.equal(applyShareFirewall({ ...target, cli: pending.cli }).status, "draft_pending");
  assert.ok(!pending.state.calls.some((call) => call.startsWith("firewall")));
  const none = fakeVercel({ project: false });
  assert.equal(applyShareFirewall({ ...target, cli: none.cli }).status, "no_share_project");
  assert.equal(shareFirewallDrift({ ...target, cli: none.cli }).status, "no_share_project");
});

test("the spend cap is read, never set, and only warned about", () => {
  const pause = [{ percent: 100, pauseUsage: true }], alert = [{ percent: 100, pauseUsage: false }];
  const cap = (budgets) => { const { cli, state } = fakeVercel({ budgets }); const result = teamSpendCap({ team: "acme", cli }); assert.ok(state.calls.every((call) => call.startsWith("api"))); return result; };
  assert.deepEqual(cap([{ scope: "team", status: "active", amount: "200", thresholds: pause }]), { team: "acme", status: "on", amountUsd: 200, pauses: true });
  assert.match(cap([{ scope: "team", status: "active", amount: "50", thresholds: alert }]).warning, /Pause/);
  assert.equal(cap([]).status, "off");
  assert.equal(teamSpendCap({ team: "acme", cli: () => { throw Error("offline"); } }).status, "unknown");
});
