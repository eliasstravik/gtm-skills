// gtm-lib v10
import { spawn } from "node:child_process";
import { join } from "node:path";
import { verifyMigrationLedger } from "../lib/migration-ledger";

const root = process.cwd();
const url = process.env.TURSO_DATABASE_URL?.trim();
const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!url || url.startsWith("file:")) {
  throw new Error("TURSO_DATABASE_URL must be a non-file Turso URL in .env.turso");
}
if (!authToken) {
  throw new Error("TURSO_AUTH_TOKEN must be non-empty in .env.turso");
}

await runDrizzleMigration();
const verified = await verifyMigrationLedger({ root, url, authToken });
process.stdout.write(
  `Verified ${verified} migration ledger entr${verified === 1 ? "y" : "ies"}.\n`,
);

async function runDrizzleMigration(): Promise<void> {
  const drizzleKit = join(root, "node_modules", "drizzle-kit", "bin.cjs");
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [drizzleKit, "migrate"], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`drizzle-kit migrate exited with status ${exitCode}`);
  }
}
