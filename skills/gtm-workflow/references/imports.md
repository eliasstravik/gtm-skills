# Importing rows into production

Data goes up only as a merge-only import with Neon's own tools: rows are inserted or updated by key, never deleted, and there is no import endpoint or upload button in the app. Imports target only this workspace's own database (never another project in the same Neon organization) and usually a result table in `public` or the runtime's `gtm.companies` and `gtm.people`. Say the row count and the target table before running one; report rows inserted and updated after.

## From a laptop (the owner's own Neon login)

Every `neonctl` call passes the organization and project that setup `--deploy` saved in `workflows/data/neon.json` (never an interactive org prompt). One transaction: the CSV goes into a temporary table shaped like the target, then merges by key.

```sh
cd workflows
ORG=$(node -p 'require("./data/neon.json").orgId'); PROJECT=$(node -p 'require("./data/neon.json").projectId')
psql "$(neonctl connection-string --org-id "$ORG" --project-id "$PROJECT")" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
CREATE TEMP TABLE incoming (LIKE public.example_scores INCLUDING DEFAULTS) ON COMMIT DROP;
\copy incoming (key, score, reason, updated_at) FROM 'scores.csv' WITH (FORMAT csv, HEADER true)
INSERT INTO public.example_scores AS t (key, score, reason, updated_at)
SELECT key, score, reason, updated_at FROM incoming
ON CONFLICT (key) DO UPDATE SET score = excluded.score, reason = excluded.reason, updated_at = excluded.updated_at
RETURNING (xmax = 0) AS inserted;
COMMIT;
SQL
```

The `RETURNING` lines count inserts (`t`) and updates (`f`). Name only the columns the CSV has; a column left out keeps its value on update. Never `DELETE`, `TRUNCATE` or change the schema; schema changes are migrations and go up with `git push`. Never print the connection string.

## From the Slack agent (no credential in its sandbox)

The agent's host adds `Neon-Connection-String` to requests to this workspace's database address (`GTM_NEON_SQL_URL`, exported to the sandbox without any secret). The connection belongs to a role that can only `SELECT`, `INSERT` and `UPDATE` the workflow tables and `gtm.companies`/`gtm.people`; Postgres itself refuses a delete. Send the CSV rows as one JSON parameter, in batches of at most 500 rows and 1 MB:

```sh
curl -sS -X POST "$GTM_NEON_SQL_URL" -H 'content-type: application/json' --data @- <<'JSON'
{ "query": "INSERT INTO public.example_scores AS t SELECT * FROM json_populate_recordset(null::public.example_scores, $1) ON CONFLICT (key) DO UPDATE SET score = excluded.score, reason = excluded.reason, updated_at = excluded.updated_at RETURNING (xmax = 0) AS inserted",
  "params": ["[{\"key\":\"acme.com\",\"score\":80,\"reason\":\"fits\",\"updated_at\":\"2026-09-26T00:00:00Z\",\"cost_usd\":0}]"] }
JSON
```

`json_populate_recordset` fills every column the JSON names and leaves the rest null, so each object carries every NOT NULL column (`key`, `updated_at`, `cost_usd` on a result table), and `DO UPDATE SET` names only the columns the file supplies. Read the target's columns first (`select column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' and table_name = '<table>'`). The reply's `rows` hold one `inserted` flag per row. A `permission denied` answer means the statement tried something the import role cannot do; do not look for a way around it.

## Setting up the agent's import role (once per workspace)

`node <gtm-agent skill>/scripts/import-access.mjs --workspace <path> --team <team> --agent-project <gtm-agent-…>` runs, as the database owner and through the owner's `neonctl` login, plain SQL that creates the role (a role made with `neonctl`, the Console or the Neon API would join `neon_superuser` and could delete everywhere), grants `SELECT, INSERT, UPDATE` on the `public` tables with default privileges for tables later migrations add, and on `gtm.companies` and `gtm.people`, stores the role's connection string as the sensitive `GTM_NEON_IMPORT_URL` on the agent project, then checks through Neon's HTTP endpoint that an insert and an update work and a delete and a truncate are refused, including on a table created after the grants. Redeploy the agent afterwards.
