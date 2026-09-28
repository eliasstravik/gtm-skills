import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const dir = resolve(process.argv[2]);
async function inspect(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await inspect(path);
    else if (/\.(mjs|js|json)$/.test(item.name)) {
      const text = await readFile(path, "utf8");
      assert.ok(
        !/GTM_CONNECTIONS_VERCEL_TOKEN|connection-management|connectionsVercel|GTM_VIEWER_LINK_KEY|token_ciphertext|gtm_viewer_grants|DATABASE_URL|embedded-postgres|GTM_RUN_SECRET|CRON_SECRET|drizzle-orm|workflow\/core/.test(
          text,
        ),
        `Private dependency in ${path}`,
      );
    }
  }
}
await inspect(join(dir, "server"));
// The page's own code too: no Keys page form or route in what a share link loads.
for (const item of await readdir(join(dir, "public", "viewer-assets")))
  if (item.endsWith(".js"))
    assert.ok(!/connection-management/.test(await readFile(join(dir, "public", "viewer-assets", item), "utf8")), `Connections code in public/viewer-assets/${item}`);
console.log(
  "Share server contains no workflow engine, database or administration credentials.",
);
