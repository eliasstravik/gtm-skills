# Cost-aware design

Apply this when building, changing, reviewing or running a workflow. Cost comes from the design. Caps only stop a run once the money is already spent.

## Why: the September 2026 incident

A network workflow resolved each person and company with this query:

```sql
SELECT * FROM companies WHERE 0 OR (linkedin_company_id = ? OR EXISTS (
  SELECT 1 FROM json_each(identifiers_json) a WHERE json_extract(a.value, '$.value') = ?))
```

The `json_each` branch cannot use an index, so each lookup read the whole table. The query ran once per record, and so did a similar attempt lookup. The cost therefore grew with records × table size. In one month the workspace database read 536M rows against a 500M quota. After that, Turso blocked every read and every workflow failed. No single run looked expensive.

## Rules

1. **Bill by rows scanned, not rows returned.** Turso (libSQL) bills every row a query reads. A query inside a loop must be an index `SEARCH`. Check it with `EXPLAIN QUERY PLAN <sql>` against the local database: `SCAN <table>` inside a loop is a design error. Add an index in a migration, or look the value up through an indexed column. Examples are `profile_identifiers` for profile aliases and `getProfile`/`resolveIdentity` from `lib/profiles/store.ts`.
2. **Never match on JSON in a per-record lookup.** `json_each`, `json_extract` or `LIKE '%…%'` over a JSON column scans every row. Store the value you match on in its own indexed column or side table.
3. **Batch.** Read what the step needs in one query (`WHERE key IN (…)`, up to about 200 keys a chunk), then join in memory. Write in one statement or transaction per chunk, not one per record.
4. **Do not re-read whole tables.** Never count, page or filter a whole table once per step, per row, or on a polling timer. `LIMIT … OFFSET` re-reads every skipped row on each page. Page by key instead: `WHERE key > ? ORDER BY key LIMIT ?`. Load a population once per run and pass keys to children.
5. **Paid calls:** dedupe inputs first, skip records that are fresh or recently missed (`isFresh`, `recentMiss`, `cached()`), keep `maxRetries = 0` on paid steps, and never loop until success.
6. **Estimate before running.** Rows read ≈ records × queries per record × rows each query reads. Calls ≈ distinct records needing work × paid calls per record × price. Use the real table sizes. If either number is far above what the result is worth, or would surprise the user, redesign first or state it before running. A full scan of a 50k-row table for each of 10k records is 500M reads.
7. **Test small.** Run one row, or the usual one-row test, and check its query plans and real cost before a full run.

## Review check

Before saving a new or changed workflow:

- Every SQL statement that runs per record, per step, or on a schedule has a plan with no `SCAN` of a large table.
- No per-record query matches on JSON.
- No per-record loop of single-row queries where one batched read would do.
- The rows-read and paid-call estimates were stated with the cost statement.
