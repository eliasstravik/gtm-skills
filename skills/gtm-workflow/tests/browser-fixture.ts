/** A synthetic database and engine adapters for reproducible browser acceptance checks. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { sql } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { viewerApi } from "../templates/lib/viewer-handler";
import { hostedOwnerCheck } from "../templates/lib/viewer-access";
// The browser fixture has no Vercel login; it stands in for a signed-in owner.
hostedOwnerCheck.check = async () => {};
import { db } from "../templates/lib/db";
import { testDatabase } from "./db";
import { page } from "../templates/viewer/shell";
import registry, {
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
  companies: pgTable("fixture_companies", {
    key: text().primaryKey(),
    name: text(),
  }),
  employment: pgTable("fixture_employment", {
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
await testDatabase();
const client = db();
// Physical names carry a prefix: the runtime's own gtm.people and gtm.companies come first on the local search path.
for (const statement of [
  "CREATE TABLE fixture_people (key TEXT PRIMARY KEY,name TEXT,secret TEXT)",
  "CREATE TABLE fixture_companies (key TEXT PRIMARY KEY,name TEXT)",
  "CREATE TABLE fixture_employment (key TEXT PRIMARY KEY,person TEXT,company TEXT)",
  "INSERT INTO fixture_people SELECT 'p' || lpad(x::text, 5, '0'), CASE WHEN x=1 THEN 'Ada Example' ELSE 'Person ' || x END, 'PRIVATE' FROM generate_series(1, 10000) x",
  "INSERT INTO fixture_companies VALUES ('acme','Acme Labs'),('orbit','Orbit Example')",
  "INSERT INTO fixture_employment VALUES ('a','p00001','acme'),('b','p00001','orbit')",
]) await client.execute(statement);
const publicDir = resolve(process.argv[2]);
if (process.env.GTM_VIEWER_FIXTURE_COLUMNS === "1") {
  const names = ["domain", "description", "industries", "company_size_label", "headquarters_label", "enriched_at", "enrichment_status", "linkedin_url", "tagline", "website_url", "email_domain", "founded_year", "phone", "revenue", "funding", "technologies", "locations", "specialties", "identifiers", "sources", "provenance", "section_status", "raw_responses", "last_attempt_at", "error", "cost_usd", "created_at", "updated_at"];
  Object.assign(tables, { companies: pgTable("fixture_companies", {
    key: text().primaryKey(), name: text(), ...Object.fromEntries(names.map(name => [name, text()])),
  }) });
  entry.data.tables.find(table => table.name === "companies")!.columns.push(...names);
  Object.assign(entry.data.tables.find(table => table.name === "companies")!, { defaultColumns: ["name", "domain", "description", "industries", "company_size_label", "enrichment_status"] });
  for (const name of names) await client.execute(sql`ALTER TABLE fixture_companies ADD COLUMN ${sql.identifier(name)} TEXT`);
  await client.execute("UPDATE fixture_companies SET domain='example.com', description='Synthetic company for interface checks', industries='Software', company_size_label='11–50', headquarters_label='Stockholm', enrichment_status='Enriched'");
}
if (process.env.GTM_VIEWER_FIXTURE_LINKS === "1") {
  Object.assign(tables, {
    people: pgTable("fixture_people", {
      key: text().primaryKey(),
      name: text(),
      secret: text(),
      website: text(),
      profile: text(),
    }),
  });
  entry.data.tables[0].columns.push("website", "profile");
  entry.sharePolicy.tables[0].columns.push("website", "profile");
  for (const statement of [
    "ALTER TABLE fixture_people ADD COLUMN website TEXT",
    "ALTER TABLE fixture_people ADD COLUMN profile TEXT",
    "UPDATE fixture_people SET website = 'example.com', profile = 'https://example.org/#profile' WHERE key = 'p00001'",
    "UPDATE fixture_people SET website = 'javascript:alert(1)' WHERE key = 'p00002'",
  ]) await client.execute(statement);
}
if (process.env.GTM_VIEWER_FIXTURE_WORKSPACE === "1") {
  await client.execute("CREATE TABLE imported_contacts (email TEXT, name TEXT)");
  await client.execute("INSERT INTO imported_contacts VALUES ('ada@example.com', 'Ada Import'), ('lin@example.com', 'Lin Import')");
  Object.assign(process.env, {
    GTM_CONNECTIONS_ORIGIN: "https://private.example",
    GTM_CONNECTIONS_ENABLED: "1",
    GTM_VIEWER_VERCEL_RUNS_URL: "https://vercel.com/acme/workflows/workflows/runs?environment=production",
    GTM_VIEWER_DATABASE_URL: "https://console.neon.tech/app/projects/acme",
  });
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
