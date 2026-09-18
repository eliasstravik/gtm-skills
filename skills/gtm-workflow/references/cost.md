# Cost-aware design

Apply this when building, changing, reviewing or running a workflow. Cost comes from the design. Caps only stop a run once the money is already spent.

## Why: the September 2026 incident

A network workflow resolved each person and company with this query:

```sql
SELECT * FROM companies WHERE 0 OR (linkedin_company_id = ? OR EXISTS (
  SELECT 1 FROM json_each(identifiers_json) a WHERE json_extract(a.value, '$.value') = ?))
```

The `json_each` branch cannot use an index, so each lookup read the whole table. The query ran once per record, and so did a similar attempt lookup. The cost therefore grew with records × table size. In one month the workspace database read 536M rows against a 500M quota. After that, Turso blocked every read and every workflow failed. No single run looked expensive.

## What the runtime enforces

Rules alone did not hold, so the runtime enforces them. After the first fix, two 10-row runs and a few agent questions still read 1.27M rows: a workflow and the Data pages matched members with `json_each` over `sources_json` and paged with `OFFSET`.

- **One client.** Every query goes through `rawClient()` or `db()` from `lib/db.ts`. Nothing else may import `@libsql/client`.
- **The guard plans every statement** (`lib/db-guard.ts`). In a workflow run and in runtime code it is strict: a full table scan, or `OFFSET`, is refused with an error that names the table and what to use. It reads the query plan, so it judges queries nobody has written yet, aliased or not. A one-off question through `POST /api/query` and a person browsing Data may scan, and are charged for it.
- **Budgets.** Each statement is charged an estimate of rows read: the size of every table it scans (times 5 when `json_each` expands under the scan) plus rows returned, never less than 1. When a budget is spent the work stops with an error that names the setting. The estimate is a floor; `turso db inspect <db> --queries` is the bill.
- **The build checks before deploy.** `npm run build` runs `scripts/check-queries.mjs`: every query a workflow registers runs against a seeded database through the same guard. A scan, `OFFSET`, a heavy JSON column, SQL of its own in a workflow file, or a second database client fails the build, so the push never goes live.

### Settings the workspace owner can change

All in the `gtm_settings` table. No code change and no deploy; a running server picks a change up within a minute. A missing row means the default.

| Setting | Default | Caps |
|---|---|---|
| `guard_mode` | `enforce` | `enforce` refuses and stops. `warn` refuses nothing and records what it would have refused or stopped in `guard_log`. |
| `rows_per_run` | 200000 | Estimated rows one workflow run may read. |
| `rows_per_run_ceiling` | 2000000 | The most a run may raise its own budget to. |
| `rows_per_conversation` | 100000 | One agent conversation through `/api/query` (header `x-gtm-conversation`). |
| `rows_per_day_agent` | 100000 | Agent questions sent without that header, shared per day. |
| `rows_per_statement` | 50000 | The largest scan one interactive statement may make. |
| `rows_per_day_browsing` | 1000000 | People browsing Data pages and shared viewers, per day. |
| `rows_per_day_workspace` | 5000000 | Everything together, per day. |
| `spend_usd_per_day` | 100 | US dollars of paid API calls per day, across all runs. |

- Read them, with today's usage and the latest `guard_log` rows: `GET /api/settings` with the bearer.
- Change one: `PUT /api/settings` with `{ "key": "rows_per_run", "value": 500000 }`; `"value": null` restores the default. Or plain SQL: `INSERT INTO gtm_settings (key, value, updated_at) VALUES ('rows_per_run', '500000', datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value`.
- Change a setting only when the workspace owner asks for that change. Never raise one to get past a refusal; fix the query.
- **A deliberately large run** raises its own budget for that run only: start it with `maxRowsRead` in the input, for example `POST /api/run/<slug>` with `{ "maxRowsRead": 1000000 }`. It is clamped to `rows_per_run_ceiling`. A workflow passes it on with `maxRowsRead: input.maxRowsRead` in `runRows`; fan-out children get their share. Other workflows call `setRunReadBudget(rows)` from `lib/db.ts` in their first step.
- Per-run paid caps are unchanged (`maxSpendUsd`, the profile run budget). `spend_usd_per_day` stops a row workflow before it starts and defers paid profile lookups (`budget_deferred`) once the day's total is reached.

### Reading a population cheaply

JSON columns are the full record, for storage and display. Whatever you filter, join or count by has an indexed side table, kept exact by database triggers on every write:

- `profile_memberships (entity, workflow_id, entity_key)`: who is in which workflow, from `sources_json`.
- `person_companies (person_key, company_key, is_current)`: who works or worked where, from `experiences_json`.
- `profile_identifiers`: identity aliases, from `identifiers_json`.

In a workflow use `lib/profiles/population.ts`: `nextBatch` (key paging, named columns), `companiesOf(personKeys)`, `companyPopulation(workflowId)` once per run, `progressCounts(workflowId, population, resultTable)`. For a one-off question, the same in SQL:

```sql
-- members of a workflow
SELECT COUNT(*) FROM profile_memberships WHERE workflow_id = ? AND entity = 'people';
-- next page of members, named columns only
SELECT p.key, p.full_name FROM profile_memberships m JOIN people p ON p.key = m.entity_key
WHERE m.workflow_id = ? AND m.entity = 'people' AND m.entity_key > ? ORDER BY m.entity_key LIMIT 100;
-- current companies of a workflow's people
SELECT DISTINCT pc.company_key FROM profile_memberships m
JOIN person_companies pc ON pc.person_key = m.entity_key AND pc.is_current = 1
WHERE m.workflow_id = ? AND m.entity = 'people';
-- progress: done, failed and remaining against a result table keyed like the population
SELECT COUNT(*) AS total, COUNT(r.key) AS done, SUM(r.error IS NOT NULL) AS failed
FROM profile_memberships m LEFT JOIN qualified r ON r.key = m.entity_key
WHERE m.workflow_id = ? AND m.entity = 'people';
```

Never select `raw_responses_json` or `provenance_json` for more than one profile; `getProfile` reads one in full.

### SQL of your own in a workflow

Only through `defineQuery` from `lib/query.ts`, so the build can run it:

```ts
const above = defineQuery({ name: "find-people/above", sql: "SELECT key, score FROM example_scores WHERE score >= ? ORDER BY score LIMIT 500", example: [70] });
const rows = await above([70]); // inside a "use step" function
```

`??` takes a list (`WHERE key IN (??)`). A Drizzle query registers with `build` in place of `sql`. If the check says the query scans, add an index on the filtered column in the table file (`index("…").on(t.score)`), run `npm run db:generate`, and check again with `npm run check:queries`.

## Rules

1. **Bill by rows scanned, not rows returned.** Turso (libSQL) bills every row a query reads. A query inside a loop must be an index `SEARCH`. Check it with `EXPLAIN QUERY PLAN <sql>` against the local database: `SCAN <table>` inside a loop is a design error. Add an index in a migration, or look the value up through an indexed column. Examples are `profile_identifiers` for profile aliases, `profile_memberships` for workflow membership, `person_companies` for employment, and `getProfile`/`resolveIdentity` from `lib/profiles/store.ts`.
2. **Never match on JSON in a per-record lookup.** `json_each`, `json_extract` or `LIKE '%…%'` over a JSON column scans every row. Store the value you match on in its own indexed column or side table.
3. **Batch.** Read what the step needs in one query (`WHERE key IN (…)`, up to about 200 keys a chunk), then join in memory. Write in one statement or transaction per chunk, not one per record.
4. **Do not re-read whole tables.** Never count, page or filter a whole table once per step, per row, or on a polling timer. `LIMIT … OFFSET` re-reads every skipped row on each page. Page by key instead: `WHERE key > ? ORDER BY key LIMIT ?`. Load a population once per run and pass keys to children.
5. **Paid calls:** dedupe inputs first, skip records that are fresh or recently missed (`isFresh`, `recentMiss`, `cached()`), keep `maxRetries = 0` on paid steps, and never loop until success.
6. **Estimate before running.** Rows read ≈ records × queries per record × rows each query reads. Calls ≈ distinct records needing work × paid calls per record × price. Use the real table sizes. If either number is far above what the result is worth, or would surprise the user, redesign first or state it before running. A full scan of a 50k-row table for each of 10k records is 500M reads.
7. **Test small.** Run one row, or the usual one-row test, and check its query plans and real cost before a full run.

## Review check

Before saving a new or changed workflow:

- `npm run check:queries` passes, and the workflow file has no SQL outside `defineQuery` and the helpers.
- Every SQL statement that runs per record, per step, or on a schedule has a plan with no `SCAN` of a table. The plan prints the alias, not the table: `SCAN pp` is a scan of whatever `pp` names.
- No per-record query matches on JSON.
- No per-record loop of single-row queries where one batched read would do.
- The rows-read and paid-call estimates were stated with the cost statement.
