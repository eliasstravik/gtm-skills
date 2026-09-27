# Importing a CSV into production

A CSV import is a run. Start the workflow that owns the target table with the file's rows as `rows`: the workflow resolves identities, applies its caps and freshness, and saves its own results, exactly as for any other run. There is no import endpoint, no upload button and no direct database access for imports. Say the row count and the workflow before starting; report the run's totals after.

## The rows

Each CSV line becomes one row object with a `key` (the workflow's own key: a company domain, a LinkedIn URL, whatever its `defaultInput` rows use) plus any columns the workflow reads from its input rows. Read the workflow file first to see which fields its steps use; drop the rest. Rows with the same key are one row. A key the table already holds fresh is skipped as usual; pass the workflow's own `refresh` input, when it has one, to redo it.

## Starting it

The run's input is the workflow's `defaultInput` with the body merged over it, so `{ "rows": [...] }` replaces the default rows and keeps the caps. Above the workflow's chunk size the run fans out into child runs by itself.

- From the Slack agent: `POST $GTM_WORKFLOW_URL/api/run/<slug>` with `{ "rows": [...] }`; the host adds the credential.
- From a laptop: `vercel curl /api/run/<slug> -- -X POST -H 'content-type: application/json' --data @rows.json` in `workflows/`.
- Locally: `POST http://127.0.0.1:3939/api/run/<slug>` while `npm run dev` runs.

One request carries at most about 4 MB of JSON; split a bigger file into several runs, one after the other. The reply is `{ id }`; follow it with `GET /api/runs/<id>` as for any run. A workflow that is already running answers that it is; wait for that run to finish, then start the import.

## Rows no workflow produces

A CSV whose columns no workflow computes (a list of accounts from a CRM export to keep as-is, say) needs a workflow that takes those rows and saves them: create one with gtm-workflow Create whose step returns the row's own columns (`costUsd: 0`, no paid calls), then import through it as above. Its table is an ordinary result table.
