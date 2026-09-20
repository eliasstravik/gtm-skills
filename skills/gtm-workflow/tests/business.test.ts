import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, db } from "../templates/lib/db";
import { testDatabase } from "./db";
import { validateBusinessGraph } from "../templates/scripts/business-graph.mjs";
import {
  destinations,
  runDestination,
} from "../templates/lib/viewer-destinations";
import { revokeLegacyLinks } from "../templates/lib/viewer-grants";
after(closeDb);
test("business graphs require meaningful branches and valid source references", () => {
  const root = mkdtempSync(join(tmpdir(), "business-graph-"));
  mkdirSync(join(root, "workflows"));
  writeFileSync(
    join(root, "workflows/check.ts"),
    "export const check = true;\n",
  );
  const graph = {
    nodes: [
      {
        id: "check",
        label: "Qualified?",
        kind: "decision",
        explanation: "Check the company criteria.",
        source: { path: "workflows/check.ts", line: 1 },
      },
      {
        id: "save",
        label: "Save match",
        kind: "output",
        explanation: "Save matching companies.",
      },
    ],
    edges: [{ id: "yes", source: "check", target: "save", label: "Yes" }],
  };
  try {
    validateBusinessGraph(graph, root);
    for (const invalid of [
      undefined,
      { ...graph, nodes: [...graph.nodes, graph.nodes[0]] },
      { ...graph, edges: [{ ...graph.edges[0], label: "" }] },
      { ...graph, edges: [{ ...graph.edges[0], target: "missing" }] },
      {
        ...graph,
        nodes: [{ ...graph.nodes[0], source: { path: "../private.ts" } }],
      },
      {
        ...graph,
        nodes: [
          {
            ...graph.nodes[0],
            source: { path: "workflows/check.ts", line: 100 },
          },
        ],
      },
    ])
      assert.throws(() => validateBusinessGraph(invalid, root));
  } finally {
    rmSync(root, { recursive: true });
  }
});
test("destinations use the deployed revision and reject credential-bearing or wrong-origin links", () => {
  const entry: any = { source: "enrich-network" };
  Object.assign(process.env, {
    VERCEL: "1",
    GTM_VIEWER_REPOSITORY: "acme/workspace",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    GTM_VIEWER_VERCEL_RUNS_URL:
      "https://vercel.com/acme/workflows/workflows/runs?environment=production",
    GTM_VIEWER_DATABASE_URL: "https://console.neon.tech/app/projects/acme",
  });
  assert.equal(
    destinations(entry).source?.url,
    `https://github.com/acme/workspace/blob/${"a".repeat(40)}/workflows/workflows/enrich-network.ts`,
  );
  assert.equal(
    runDestination("wrun_" + "A".repeat(26))?.url,
    "https://vercel.com/acme/workflows/workflows/runs/wrun_" +
      "A".repeat(26) +
      "?environment=production",
  );
  assert.deepEqual(destinations().runs, {
    url: "https://vercel.com/acme/workflows/workflows/runs?environment=production",
    label: "Open in Vercel",
  });
  process.env.GTM_VIEWER_DATABASE_URL = "https://token@console.neon.tech/acme";
  assert.equal(destinations(entry).database, undefined);
  process.env.GTM_VIEWER_VERCEL_RUNS_URL =
    "https://evil.example/acme/workflows/workflows/runs";
  assert.equal(runDestination("wrun_" + "A".repeat(26)), undefined);
  assert.equal(destinations().runs, undefined);
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  assert.equal(destinations(entry).source, undefined);
  delete process.env.VERCEL;
  process.env.GTM_VIEWER_INSPECTOR_URL = "http://localhost:4200";
  assert.equal(runDestination("wrun_" + "A".repeat(26)), undefined);
  process.env.GTM_VIEWER_INSPECTOR_STORE = "local";
  assert.deepEqual(destinations().runs, { url: "http://localhost:4200/", label: "Open in Workflow" });
  assert.ok(
    runDestination("wrun_" + "A".repeat(26))?.url.startsWith(
      "http://localhost:4200/run/",
    ),
  );
  assert.equal(destinations(entry).source?.path, "workflows/enrich-network.ts");
});
test("revoking legacy links touches only the selected workflow and leaves business data intact", async () => {
  await testDatabase();
  const client = db();
  // Links from before recovery existed carry no ciphertext; an import can bring them along.
  await client.execute(
    "INSERT INTO gtm.gtm_viewer_grants (id, token_hash, workflow_id, workspace, environment, views, created_at) VALUES ('old','hash','a','workspace','production','[\"logic\"]',now()),('other','hash2','b','workspace','production','[\"logic\"]',now())",
  );
  await client.execute("CREATE TABLE business (name TEXT)");
  await client.execute("INSERT INTO business VALUES ('keep')");
  const scope = {
    workspace: "workspace",
    environment: "production",
    workflowId: "a",
  };
  assert.equal(await revokeLegacyLinks(client, scope), 1);
  assert.equal(await revokeLegacyLinks(client, scope), 0);
  assert.equal(
    (await client.execute("SELECT revoked_at FROM gtm.gtm_viewer_grants WHERE id='other'")).rows[0].revoked_at,
    null,
  );
  assert.equal(
    (await client.execute("SELECT name FROM business")).rows[0].name,
    "keep",
  );
});
