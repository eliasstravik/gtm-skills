import { createClient } from "@libsql/client";
import { build } from "esbuild";
await build({
  stdin: {
    contents:
      'export { ledgerSchemaSql } from "./lib/profiles/ledger"; export { profileLookupSql, profileLookupBackfillSql } from "./lib/profiles/schema";',
    resolveDir: process.cwd(),
  },
  outfile: "node_modules/.gtm-profiles/migrate.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const { ledgerSchemaSql, profileLookupSql, profileLookupBackfillSql } = await import(
  "../node_modules/.gtm-profiles/migrate.mjs"
);
const hosted = Boolean(process.env.VERCEL);
const url = hosted ? process.env.TURSO_DATABASE_URL : "file:./data/gtm.db";
if (!url) throw new Error("TURSO_DATABASE_URL is required");
const client = createClient({
  url,
  authToken: hosted ? process.env.TURSO_AUTH_TOKEN : undefined,
});
try {
  await client.executeMultiple(ledgerSchemaSql);
  // Shared profile tables come from the Drizzle migrations; skip lookups if a workspace predates them.
  const tables = await client.execute(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('people','companies')",
  );
  if (Number(tables.rows[0].n) === 2)
    await client.executeMultiple(profileLookupSql + profileLookupBackfillSql);
  console.log("Profile operational storage ready.");
} finally {
  client.close();
}
