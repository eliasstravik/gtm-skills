/** Synthetic SQLite and engine adapters for reproducible browser acceptance checks. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { viewerApi } from "../templates/lib/viewer-handler";
import { migrateViewer } from "../templates/lib/viewer-grants";
import { page } from "../templates/viewer/shell";
import registry, {
  client,
  entry,
  tables,
  run,
  fixtureRuns,
} from "./api-fixture";

Object.assign(entry, {
  businessGraph: {
    nodes: [
      {
        id: "input",
        label: "Import connections",
        kind: "input",
        explanation: "Read the supplied network identities.",
      },
      {
        id: "people",
        label: "Enrich people",
        kind: "action",
        explanation: "Find each person's current role and profile.",
        details: {
          provider: "Person enrichment",
          caching: "Reuse recently enriched profiles.",
        },
      },
      {
        id: "employer",
        label: "Employer found?",
        kind: "decision",
        explanation: "Check whether the person's profile identifies a company.",
      },
      {
        id: "companies",
        label: "Enrich companies",
        kind: "action",
        explanation: "Find details about the person's current employer.",
      },
      {
        id: "save",
        label: "Save results",
        kind: "output",
        explanation: "Save people and any identified companies for review.",
      },
    ],
    edges: [
      { id: "a", source: "input", target: "people" },
      { id: "b", source: "people", target: "employer" },
      { id: "c", source: "employer", target: "companies", label: "Yes" },
      { id: "d", source: "employer", target: "save", label: "No" },
      { id: "e", source: "companies", target: "save" },
    ],
  },
  title: "Enrich network",
  description:
    "Enrich people and their current employers from network identities.",
});
for (let i = 1; i < 50; i++)
  registry.push({
    ...entry,
    id: `workflow-${i}`,
    slug: `workflow-${i}`,
    title: `Research market ${String(i).padStart(2, "0")}`,
    workflowName: `market-${i}`,
  });
for (let i = 1; i < 45; i++)
  fixtureRuns.push({
    ...run,
    workflowName: `market-${i}`,
    runId: "wrun_" + String(i).padStart(26, "0"),
    status: ["completed", "failed", "running", "pending", "cancelled"][i % 5],
    createdAt: new Date(Date.now() - i * 3600000),
    attributes: { ...run.attributes, "gtm.viewer.id": `workflow-${i}` },
  });
Object.assign(tables, {
  companies: sqliteTable("companies", {
    key: text().primaryKey(),
    name: text(),
  }),
  employment: sqliteTable("employment", {
    key: text().primaryKey(),
    person: text(),
    company: text(),
  }),
});
entry.data.tables[0].columns = ["name", "key"];
entry.data.tables.push({
  name: "companies",
  label: "Companies",
  columns: ["name", "key"],
  labelColumn: "name",
});
const relation = {
  from: "people",
  to: "companies",
  through: "employment",
  fromColumn: "person",
  toColumn: "company",
};
(entry.data.relations as any).push(relation);
(entry.sharePolicy.relations as any).push(relation);
entry.sharePolicy.tables.push(
  {
    id: "companies",
    name: "companies",
    columns: ["key", "name"],
    row: { version: "all" },
  },
  {
    id: "employment",
    name: "employment",
    columns: ["key", "person", "company"],
    row: { version: "all" },
  },
);
process.env.GTM_VIEWER_LINK_KEY = "ab".repeat(32);
process.env.GTM_VIEWER_TEST = "1";
process.env.VERCEL = "1";
process.env.VERCEL_PROJECT_ID = "fixture";
process.env.VERCEL_ENV = "production";
process.env.GTM_VIEWER_PROTECTED = "1";
process.env.GTM_VIEWER_LABEL = "Acme";
process.env.GTM_VIEWER_SHARE_ORIGIN = "http://127.0.0.1:3943";
if (process.env.GTM_VIEWER_FIXTURE_LOCAL === "1") delete process.env.VERCEL;
await migrateViewer(client);
await client.executeMultiple(
  "CREATE TABLE people (key TEXT PRIMARY KEY,name TEXT,secret TEXT); CREATE TABLE companies (key TEXT PRIMARY KEY,name TEXT); CREATE TABLE employment (key TEXT PRIMARY KEY,person TEXT,company TEXT);",
);
await client.execute(
  "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO people SELECT printf('p%05d',x), CASE WHEN x=1 THEN 'Ada Example' ELSE 'Person ' || x END, 'PRIVATE' FROM n",
);
await client.executeMultiple(
  "INSERT INTO companies VALUES ('acme','Acme Labs'),('orbit','Orbit Example'); INSERT INTO employment VALUES ('a','p00001','acme'),('b','p00001','orbit');",
);
const publicDir = resolve(process.argv[2]);
if (process.env.GTM_VIEWER_FIXTURE_COLUMNS === "1") {
  const names = ["domain", "description", "industries", "company_size_label", "headquarters_label", "enriched_at", "enrichment_status", "linkedin_url", "tagline", "website_url", "email_domain", "founded_year", "phone", "revenue", "funding", "technologies", "locations", "specialties", "identifiers", "sources", "provenance", "section_status", "raw_responses", "last_attempt_at", "error", "cost_usd", "created_at", "updated_at"];
  Object.assign(tables, { companies: sqliteTable("companies", {
    key: text().primaryKey(), name: text(), ...Object.fromEntries(names.map(name => [name, text()])),
  }) });
  entry.data.tables.find(table => table.name === "companies")!.columns.push(...names);
  Object.assign(entry.data.tables.find(table => table.name === "companies")!, { defaultColumns: ["name", "domain", "description", "industries", "company_size_label", "enrichment_status"] });
  for (const name of names) await client.execute(`ALTER TABLE companies ADD COLUMN ${name} TEXT`);
  await client.execute("UPDATE companies SET domain='example.com', description='Synthetic company for interface checks', industries='Software', company_size_label='11–50', headquarters_label='Stockholm', enrichment_status='Enriched'");
}
if (process.env.GTM_VIEWER_FIXTURE_LINKS === "1") {
  Object.assign(tables, {
    people: sqliteTable("people", {
      key: text().primaryKey(),
      name: text(),
      secret: text(),
      website: text(),
      profile: text(),
    }),
  });
  entry.data.tables[0].columns.push("website", "profile");
  entry.sharePolicy.tables[0].columns.push("website", "profile");
  await client.executeMultiple(
    "ALTER TABLE people ADD COLUMN website TEXT; ALTER TABLE people ADD COLUMN profile TEXT;" +
      "UPDATE people SET website = 'example.com', profile = 'https://example.org/#profile' WHERE key = 'p00001';" +
      "UPDATE people SET website = 'javascript:alert(1)' WHERE key = 'p00002';",
  );
}
for (const port of process.env.GTM_VIEWER_FIXTURE_LOCAL === "1"
  ? [3944]
  : [3942, 3943])
  createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url!, `http://127.0.0.1:${port}`);
      if (url.pathname.startsWith("/viewer-assets/")) {
        if (url.pathname.includes("..")) throw Error();
        const file = resolve(publicDir, "." + url.pathname);
        const content = await readFile(file);
        outgoing.setHeader(
          "content-type",
          (
            {
              ".js": "text/javascript",
              ".css": "text/css",
              ".woff2": "font/woff2",
            } as any
          )[extname(file)] ?? "application/octet-stream",
        );
        outgoing.end(content);
        return;
      }
      if (!url.pathname.startsWith("/api/")) {
        outgoing.setHeader("content-type", "text/html");
        outgoing.end(page);
        return;
      }
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const headers = new Headers(incoming.headers as any);
      if (port === 3943) headers.set("x-gtm-viewer-project", "fixture");
      const response = await viewerApi(
        new Request(url, {
          method: incoming.method,
          headers,
          ...(body.length ? { body } : {}),
        }),
        port === 3943,
      );
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      const reader = response.body!.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        outgoing.write(value);
      }
      outgoing.end();
    } catch {
      outgoing.writeHead(500);
      outgoing.end("Fixture unavailable");
    }
  }).listen(port, "127.0.0.1", () =>
    console.log(`Synthetic viewer ready on http://127.0.0.1:${port}`),
  );
