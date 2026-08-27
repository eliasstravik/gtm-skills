// gtm-lib v9
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@libsql/client";

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
await verifyMigrationLedger();

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

async function verifyMigrationLedger(): Promise<void> {
  const journal = JSON.parse(
    await readFile(join(root, "drizzle", "meta", "_journal.json"), "utf8"),
  ) as { entries?: { tag?: string }[] };
  if (!Array.isArray(journal.entries)) {
    throw new Error("drizzle/meta/_journal.json has no entries array");
  }

  const expected = new Map<string, string>();
  for (const entry of journal.entries) {
    if (!entry.tag) throw new Error("Drizzle journal entry has no tag");
    const file = `drizzle/${entry.tag}.sql`;
    const contents = await readFile(join(root, file));
    expected.set(createHash("sha256").update(contents).digest("hex"), file);
  }

  const client = createClient({ url, authToken });
  try {
    const result = await client.execute("SELECT hash FROM __drizzle_migrations");
    for (const row of result.rows) expected.delete(String(row.hash));
  } finally {
    client.close();
  }

  if (expected.size > 0) {
    throw new Error(
      `Migration ledger is missing: ${[...expected.values()].join(", ")}`,
    );
  }
  process.stdout.write(
    `Verified ${journal.entries.length} migration ledger entr${journal.entries.length === 1 ? "y" : "ies"}.\n`,
  );
}
