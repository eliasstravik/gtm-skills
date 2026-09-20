// drizzle-kit studio against this workspace's local database, or the external one when GTM_DATABASE=external is set in this shell.
import { spawn } from "node:child_process";
import { localDatabaseUrl } from "./local-database.mjs";

const url = process.env.GTM_DATABASE === "external"
  ? process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  : await localDatabaseUrl(".").catch((error) => { console.error(error.message); process.exit(1); });
if (!url) { console.error("GTM_DATABASE=external needs DATABASE_URL in this shell"); process.exit(1); }
const child = spawn(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "studio"], { stdio: "inherit", env: { ...process.env, GTM_DRIZZLE_URL: url } });
child.on("exit", (code) => process.exit(code ?? 0));
