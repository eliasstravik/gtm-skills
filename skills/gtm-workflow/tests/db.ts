// Every suite gets its own database on the run's Postgres, migrated by the real script and used as the app's plain role.
import { randomBytes } from "node:crypto";
import pg from "pg";
import { closeDb } from "../templates/lib/db";
import { migrate } from "../templates/scripts/migrate.mjs";
import { urlForPort } from "../templates/scripts/local-database.mjs";

const MARKER = "gtm_scratch_marker";

async function asClient<T>(url: string, work: (client: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10_000 });
  client.on("error", () => {});
  await client.connect();
  try { return await work(client); } finally { await client.end().catch(() => {}); }
}

/** Phase 6 only: one scratch Neon database reused by every suite. Anything that is not empty or marked is refused. */
async function resetScratch(unpooled: string) {
  await asClient(unpooled, async (client) => {
    const user = await client.query(
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') AND table_schema NOT LIKE 'pg\\_%'",
    );
    const marked = user.rows.some((row) => row.table_schema === "public" && row.table_name === MARKER);
    if (user.rows.length && !marked) throw new Error("The scratch database holds tables and no scratch marker: refusing to touch it");
    await client.query("DROP SCHEMA IF EXISTS gtm CASCADE");
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    for (const row of user.rows)
      if (row.table_schema === "public" && row.table_name !== MARKER) await client.query(`DROP TABLE IF EXISTS public.${client.escapeIdentifier(row.table_name)} CASCADE`);
    await client.query(`CREATE TABLE IF NOT EXISTS public.${MARKER} (created_at timestamptz NOT NULL DEFAULT now())`);
  });
}

export async function testDatabase({ migrated = true } = {}) {
  const runtime = process.env.GTM_TEST_RUNTIME;
  if (!runtime) throw new Error("Run suites through tests/run.mjs: it starts the test Postgres");
  let url: string, unpooled: string;
  if (process.env.GTM_TEST_SCRATCH === "1") {
    url = process.env.NEON_CHECK_URL!;
    unpooled = process.env.NEON_CHECK_URL_UNPOOLED!;
    await resetScratch(unpooled);
  } else {
    const port = Number(process.env.GTM_TEST_POSTGRES_PORT);
    const name = `test_${randomBytes(6).toString("hex")}`;
    await asClient(`postgres://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`, (client) => client.query(`CREATE DATABASE ${name} OWNER gtm`));
    url = unpooled = urlForPort(port).replace(/\/gtm\?/, `/${name}?`);
  }
  process.env.DATABASE_URL = url;
  process.env.DATABASE_URL_UNPOOLED = unpooled;
  if (migrated) await migrate(unpooled);
  return { url, unpooled, query: <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]) => asClient(unpooled, (client) => client.query<T>(text, values)), close: closeDb };
}
