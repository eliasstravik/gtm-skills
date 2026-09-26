// npm run db:pull: production's rows come down, share secrets and the production marker do not, and what was in
// flight in production can neither block a local run nor be settled from here. Needs pg_dump/pg_restore 18 on PATH.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clientTools, pullDatabase } from "../templates/scripts/db-pull.mjs";
import { migrate } from "../templates/scripts/migrate.mjs";
import { isProductionDatabase } from "../templates/scripts/local-database.mjs";
import { testDatabase } from "./db";

test("a copy of production replaces local data, settles in-flight work and drops the marker and share secrets", { skip: process.env.GTM_TEST_SCRATCH === "1" }, async () => {
  clientTools();
  const production = await testDatabase();
  await migrate(production.unpooled, { production: true });
  const now = new Date().toISOString();
  await production.query("INSERT INTO public.example_scores (key, updated_at, cost_usd) VALUES ('acme', now(), 0.1)");
  await production.query("INSERT INTO gtm.people (key, created_at, updated_at, full_name) VALUES ('p1', now(), now(), 'Ada')");
  await production.query("INSERT INTO gtm.profile_runs (id, workflow_id, owner, lease_until, state, budget_micro, input_json, created_at) VALUES ('run-1', 'net', 'run-1', now() + interval '1 hour', 'running', 100, '{}', $1)", [now]);
  await production.query("INSERT INTO gtm.profile_attempts (id, run_id, entity_key, operation, state, reserved_micro, created_at) VALUES ('a-1', 'run-1', 'p1', 'person', 'dispatched', 10, $1)", [now]);
  await production.query("INSERT INTO gtm.gtm_viewer_grants (id, token_hash, workflow_id, workspace, environment, views, created_at, token_ciphertext) VALUES ('g1', 'h1', 'w', 'prj', 'production', '[\"logic\"]', now(), 'secret')");
  const local = await testDatabase();
  await local.query("INSERT INTO public.example_scores (key, updated_at, cost_usd) VALUES ('local-only', now(), 0)");
  const folder = await mkdtemp(join(tmpdir(), "gtm-pull-"));
  try {
    assert.equal(await isProductionDatabase(production.unpooled), true);
    const bytes = await pullDatabase({ source: production.unpooled, target: local.unpooled, dumpFile: join(folder, "pull.dump") });
    assert.ok(bytes > 0);
    assert.deepEqual((await local.query("SELECT key FROM public.example_scores ORDER BY key")).rows, [{ key: "acme" }]);
    assert.deepEqual((await local.query("SELECT full_name FROM gtm.people")).rows, [{ full_name: "Ada" }]);
    assert.equal(await isProductionDatabase(local.unpooled), false, "the marker stays in production");
    assert.equal((await local.query("SELECT count(*)::int AS n FROM gtm.gtm_viewer_grants")).rows[0].n, 0);
    assert.deepEqual((await local.query("SELECT state FROM gtm.profile_runs")).rows, [{ state: "cancelled" }]);
    assert.deepEqual((await local.query("SELECT state FROM gtm.profile_attempts")).rows, [{ state: "settled" }]);
    // npm run dev migrates first: the copied journal makes that a no-op.
    const journal = () => local.query("SELECT (SELECT count(*)::int FROM drizzle.gtm_runtime_migrations) AS runtime, (SELECT count(*)::int FROM drizzle.gtm_workspace_migrations) AS workspace");
    const before = (await journal()).rows;
    await migrate(local.unpooled);
    assert.deepEqual((await journal()).rows, before);
    // A local network run can start: nothing copied holds the single-flight slot or an unsettled attempt.
    await local.query("INSERT INTO gtm.profile_runs (id, workflow_id, owner, lease_until, state, budget_micro, input_json, created_at) VALUES ('local-run', 'net', 'local-run', now() + interval '1 hour', 'running', 100, '{}', now())");
    await local.query("INSERT INTO gtm.profile_attempts (id, run_id, entity_key, operation, state, reserved_micro, created_at) VALUES ('a-2', 'local-run', 'p1', 'person', 'reserved', 10, now())");
    // Production itself was only read.
    assert.deepEqual((await production.query("SELECT state FROM gtm.profile_runs")).rows, [{ state: "running" }]);
  } finally { await rm(folder, { recursive: true, force: true }); await local.close(); }
});
