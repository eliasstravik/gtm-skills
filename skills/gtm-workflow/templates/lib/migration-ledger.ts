// gtm-lib v12
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@libsql/client";

export async function verifyMigrationLedger(input: {
  root: string;
  url: string;
  authToken?: string;
}): Promise<number> {
  const journal = JSON.parse(
    await readFile(join(input.root, "drizzle", "meta", "_journal.json"), "utf8"),
  ) as { entries?: { tag?: string }[] };
  if (!Array.isArray(journal.entries)) {
    throw new Error("drizzle/meta/_journal.json has no entries array");
  }

  const expected = new Map<string, string>();
  for (const entry of journal.entries) {
    if (!entry.tag) throw new Error("Drizzle journal entry has no tag");
    const file = `drizzle/${entry.tag}.sql`;
    const contents = await readFile(join(input.root, file));
    expected.set(createHash("sha256").update(contents).digest("hex"), file);
  }

  const client = createClient({ url: input.url, authToken: input.authToken });
  try {
    const result = await client.execute("SELECT hash FROM __drizzle_migrations");
    for (const row of result.rows) expected.delete(String(row.hash));
  } finally {
    client.close();
  }

  if (expected.size > 0) {
    throw new Error(`Migration ledger is missing: ${[...expected.values()].join(", ")}`);
  }
  return journal.entries.length;
}
