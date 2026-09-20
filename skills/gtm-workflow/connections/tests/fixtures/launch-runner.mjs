// Runs the real launcher against a fixture workspace: private state in the test's own folder, a stand-in credential
// store, and a stub in place of Nitro that reports what the app would see.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "../../local/launch.mjs";

const [workspace, root, mode] = process.argv.slice(2);
async function serve({ cwd }) {
  const pg = (await import(pathToFileURL(createRequire(join(cwd, "package.json")).resolve("pg")))).default;
  const seen = { DATABASE_URL: process.env.DATABASE_URL, DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED,
    leaked: Object.keys(process.env).filter((name) => /^(?:PG|POSTGRES_)/.test(name) || name === "GTM_DATABASE") };
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  client.on("error", () => {});
  await client.connect();
  seen.user = (await client.query("SELECT current_user AS name")).rows[0].name;
  seen.tables = (await client.query("SELECT table_schema || '.' || table_name AS name FROM information_schema.tables WHERE table_schema IN ('gtm', 'public') ORDER BY 1")).rows.map((row) => row.name);
  seen.folder = await client.query("SHOW data_directory").then((result) => result.rows[0].data_directory, () => null);
  await client.end();
  writeFileSync(join(root, `seen-${process.pid}.json`), JSON.stringify(seen));
  return { async close() {} };
}
try {
  const running = await launch(workspace, mode, { stateOptions: { root, boundary: root }, store: { loadForRuntime: () => "synthetic" }, serve });
  console.log(`READY ${process.pid}`);
  // Windows has no SIGINT or SIGTERM to send; a line on stdin asks for the same clean stop.
  process.stdin.on("data", async (data) => { if (String(data).includes("close")) { await running.close(); process.exit(0); } });
  setInterval(() => {}, 1000);
} catch (error) {
  console.error(error?.name === "LocalDatabaseError" ? error.message : error);
  process.exit(1);
}
