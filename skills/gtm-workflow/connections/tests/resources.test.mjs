import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { projectByName, ensureDatabase } from "../setup/resources.mjs";
import { ConnectionError } from "../src/errors.mjs";

test("project discovery follows cursors and rejects repeated pagination", async () => {
  const project = { name: "target", id: "prj_target" };
  assert.equal(await projectByName(async (_method, path) => path.includes("until=") ? { projects: [project], pagination: { next: null } } : { projects: [], pagination: { next: 123 } }, "target"), project);
  await assert.rejects(() => projectByName(async () => ({ projects: [], pagination: { next: 123 } }), "target"), /project_inventory_incomplete/);
});
test("database setup reconciles a lost creation response without duplicate creation or secret export", async () => {
  const directory = await mkdtemp(join(homedir(), ".gtm-db-test-"));
  const project = { id: "prj_admin", name: "isolated-connections" }, fixed = { teamId: "team_test" };
  const data = new Map(), journal = { get: async (key) => data.get(key), set: async (key, value) => data.set(key, value) };
  let envs = [], resources = [], created = 0, connected = 0;
  const api = async () => ({ envs });
  const run = (_command, args) => {
    assert.equal(args.includes("--no-env-pull") || args[1] !== "add", true);
    if (args[1] === "list") return JSON.stringify({ resources });
    if (args[1] === "add") {
      created++; resources = [{ id: "store_admin", name: `${project.name}-db`, product: "Turso", status: "available", projects: [] }];
      throw Error("lost response");
    }
    assert.equal(args[2], "connect"); connected++;
    resources[0].projects = [project.name];
    envs = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"].map((key) => ({ key, target: ["production"], value: "synthetic-do-not-return" }));
    return "{}";
  };
  const options = { api, team: "test", project, fixed, state: { directory }, journal, run };
  try {
    assert.equal((await ensureDatabase(options)).resourceId, "store_admin");
    assert.equal((await ensureDatabase(options)).status, "configured");
    assert.equal(created, 1); assert.equal(connected, 1);
    assert.equal(JSON.stringify([...data]).includes("synthetic-do-not-return"), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("only a confirmed terms error becomes a human step; unknown creation is not repeated", async () => {
  const directory = await mkdtemp(join(homedir(), ".gtm-db-test-"));
  const data = new Map(), journal = { get: async (key) => data.get(key), set: async (key, value) => data.set(key, value) };
  let terms = true, creates = 0;
  const options = { api: async () => ({ envs: [] }), team: "test", project: { id: "prj_admin", name: "admin" }, fixed: { teamId: "team_test" },
    state: { directory }, journal, run: (_command, args) => {
      if (args[1] === "list") return '{"resources":[]}';
      creates++; throw new ConnectionError(terms ? "marketplace_terms_required" : "vercel_command_failed", 503);
    } };
  try {
    assert.equal((await ensureDatabase(options)).stage, "database_terms");
    terms = false;
    await assert.rejects(() => ensureDatabase(options), /vercel_command_failed/);
    await assert.rejects(() => ensureDatabase(options), /database_creation_unresolved/);
    assert.equal(creates, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("project creation reconciles an uncertain response and refuses a substituted target", async () => {
  const { ensureProject } = await import("../setup/resources.mjs");
  const data = new Map(), journal = { get: async (key) => data.get(key), set: async (key, value) => data.set(key, value) };
  const definition = { name: "synthetic-connections", framework: null };
  let projects = [], creates = 0;
  const api = async (method) => {
    if (method === "POST") { creates++; projects = [{ name: definition.name, id: "admin", accountId: "team" }]; throw Error("lost reply"); }
    return { projects, pagination: { next: null } };
  };
  const args = { api, journal, teamId: "team", definition };
  assert.equal((await ensureProject(args)).id, "admin");
  await ensureProject(args); assert.equal(creates, 1);
  projects[0] = { ...projects[0], id: "substituted" };
  await assert.rejects(ensureProject(args), /project_binding_changed/);
  projects = [];
  await assert.rejects(ensureProject(args), /project_creation_unresolved/);
  assert.equal(creates, 1);
});
