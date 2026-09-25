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
console.log(
  "Share server contains no workflow engine, database or administration credentials.",
);
