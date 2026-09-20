# Runtime upgrades and failure diagnostics

## Upgrade startup commands

After copying template-owned runtime files, run `node <skill>/scripts/upgrade-package.mjs /path/to/workflows` to preview the package merge, then add `--write` to apply it. It updates template dependencies and recognized stock startup commands, adds missing commands, and preserves user-added dependencies and customized scripts. Review each name in `review` and incorporate required build/migration steps into that command while preserving its custom behavior. Keep custom ports and explicit timeout overrides. Previous runtimes containing `scripts/gtm.ts` need a separate migration.

Copy template-owned files by path. Preserve extra user-authored files in those directories. Keep workflows, data, environment files, schedules, and custom tables intact. Install dependencies after the merge as the Upgrade procedure specifies.

`npm run dev` is the supported local launch path because it also starts the local database, builds the viewer and runs migrations. Direct `nitro dev` reads the same timeout defaults through `nitro.config.ts` and `lib/local-runtime.ts`, but skips those preparatory commands. Both local queue timeouts default to 900,000 ms. Explicit environment values, including `0`, remain overrides. Restart the existing server after an upgrade; a running queue retains the options it had when created. Verify the actual launch command and a diagram page after restart. Hosted deployments use the hosted queue and require deployment verification instead.

## Convert a SQLite workspace

One time, for a workspace from before the runtime moved to Postgres (it has `db/tables/cache.ts`, and `npm run dev` says "this workspace still uses SQLite"). Do it as part of Upgrade, in this order. The new launcher and the new template only work together, so do not stop halfway.

1. Upgrade the Connections component first: shared setup with `--upgrade`.
2. Replace the template-owned files as Upgrade describes, including the new `lib/schema/`, `lib/tables.ts`, `drizzle-runtime/`, `drizzle-runtime.config.ts`, `scripts/migrate.mjs`, `scripts/local-database.mjs` and `scripts/studio.mjs`. Delete `scripts/profile-migrate.mjs`, `scripts/viewer-migrate.mjs` and `scripts/start-viewer.mjs`.
3. Delete `db/tables/cache.ts` and `db/tables/profiles.ts`, and rewrite `db/tables/index.ts` to export the workspace's own tables only. The runtime's tables now come from `lib/tables.ts`; their names are reserved, so rename a workspace table that uses one.
4. Rewrite each remaining `db/tables/*.ts` from `sqliteTable` to `pgTable` (`drizzle-orm/pg-core`): `*_json` columns become `jsonb`, time columns `timestamp("…", { withTimezone: true })`, `is_*` and other flag columns `boolean`, money `doublePrecision`, counts `integer`, everything else `text`.
5. Search `workflows/*.ts` for what the new types change: timestamps compared or sorted as strings, `.toISOString()` written into a time column, flags tested with `=== 1` or `=== 0`, `JSON.parse` or `JSON.stringify` around a `*_json` column, and workspace-written SQL (`rawClient`, `.execute({ sql, args })`, `?` placeholders, `json_extract`, `json_each`). Fix each: times are `Date`, flags are `boolean`, JSON columns hold values, and SQL goes through Drizzle's query builder or `sql` tag as [patterns](patterns.md#names-are-identity) says.
6. Run `scripts/upgrade-package.mjs` with `--write` (it drops the old database client), then delete `package-lock.json` and `node_modules` and install fresh.
7. Confirm the workspace's own `.gitignore` ignores `data/`: the local database lives in `data/pg`.
8. Delete the old `drizzle/` folder and generate a fresh history: `npm run db:generate -- --name init`.
9. Start `npm run dev` once: it creates and migrates the local database. Keep `data/gtm.db` until its contents are no longer needed.

Local results in `data/gtm.db` are not moved automatically. To keep them, run the skill's `scripts/import-from-turso.mjs <data/gtm.db> --target-local <workflows folder>` right after that first `npm run dev` has migrated and before any workflow runs, because the import refuses a target that already holds rows. The hosted database is moved by the owner with the same script; it is not part of Upgrade.

## Diagnose the failing boundary

The `[gtm-workflow]` diagnostic records contain bounded identifiers and error names/codes, never raw request bodies, auth headers, CLI output, or nested error messages. Row/run errors preserve these diagnostics across Workflow serialization. Generic step errors retain names/codes rather than arbitrary provider payloads.

| Layer | Meaning |
| --- | --- |
| `local_queue_transport` | A local queue HTTP request failed. Undici diagnostics retain the nested code and queue message ID when available. The SDK may also emit its shorter retry log. |
| `mcp_transport` | Connecting to, requesting from, or closing an MCP server failed. |
| `mcp_tool` | The server returned `isError`; transport completed. The existing tool result remains available to the agent. |
| `cli_launch`, `cli_exit`, `cli_timeout`, `cli_result` | The process could not start, exited unsuccessfully, exceeded its deadline, or returned an error/invalid result. |
| `provider_transport`, `provider_response` | A gateway request failed, or its HTTP/JSON/job response reported failure. `provider` names the gateway contacted; `operation` identifies the requested provider/endpoint when known. |
| `step` | A workflow step or local persistence operation failed. |

Queue timeout settings do not fix provider or CLI failures. A gateway failure does not establish which upstream hop failed. Correlate run/request IDs with the gateway's evidence before attributing it. The alternate SDK `WORKFLOW_NODE_HTTP` transport does not emit Undici events; its SDK log remains the source for queue errors. No paid-call retries are added, and uncertain provider dispatches stay reserved to prevent duplicate charges.
