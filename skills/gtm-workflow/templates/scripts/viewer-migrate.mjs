import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
await build({
  entryPoints: ["lib/viewer-grants.ts"],
  outfile: "node_modules/.gtm-viewer/migrate.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const { migrateViewer, revokeLegacyLinks } = await import(
  "../node_modules/.gtm-viewer/migrate.mjs"
);
const hosted = Boolean(process.env.VERCEL);
const url = hosted ? process.env.TURSO_DATABASE_URL : "file:./data/gtm.db";
if (!url) throw Error("TURSO_DATABASE_URL is required");
const client = createClient({
  url,
  authToken: hosted ? process.env.TURSO_AUTH_TOKEN : undefined,
});
try {
  await migrateViewer(client);
  const registry = JSON.parse(
    await readFile("node_modules/.gtm-viewer/registry.json", "utf8"),
  );
  const workspace = hosted
    ? process.env.VERCEL_PROJECT_ID
    : (process.env.GTM_VIEWER_WORKSPACE ?? "local");
  const environment = hosted
    ? process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV
    : "local";
  if (!workspace || !environment) throw Error("Missing deployment identity");
  let revoked = 0;
  for (const entry of registry) {
    revoked += await revokeLegacyLinks(client, {
      workspace,
      environment,
      workflowId: entry.id,
    });
  }
  console.log(
    `Viewer migration complete. Revoked ${revoked} legacy links. Business data and runs unchanged.`,
  );
} finally {
  client.close();
}
