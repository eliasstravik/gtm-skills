// drizzle-kit studio against the local database: DATABASE_URL when set in this shell, else this workspace's built-in one.
import { spawn } from "node:child_process";
import { isProductionDatabase, localDatabaseUrl } from "./local-database.mjs";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || await localDatabaseUrl(".").catch((error) => { console.error(error.message); process.exit(1); });
if (await isProductionDatabase(url)) { console.error("That is the production database; open it in the Neon console instead"); process.exit(1); }
const child = spawn(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "studio"], { stdio: "inherit", env: { ...process.env, GTM_DRIZZLE_URL: url } });
child.on("exit", (code) => process.exit(code ?? 0));
