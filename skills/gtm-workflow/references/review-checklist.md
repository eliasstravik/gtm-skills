# Workflow review checklist

Use this checklist when an operator asks to audit or review a workflow. Run `npm run gtm -- check` first. Every check failure is MUST FIX. Report the remaining findings under the tiers below.

## MUST FIX

- Caps before spend. The workflow must use the cap-before-spend behavior owned by [`runRows()`](contract.md#workflow-and-table-contract). `gtm check` reports `missing_terminal_bookkeeping` when a row workflow bypasses `runRows()` entirely.
- Paid-step retries. Every step that calls `provider()` or `agent()` must set `maxRetries = 0`, except for the contract's confirmed-unbilled `RetryableError` path in [adapter error and retry behavior](providers.md#empty-error-and-retry-behavior). `gtm check`: `paid_step_retries`.
- Save before checkpoint. A successful row must reach its table save before `runRows()` can open the checkpoint described in [the workflow contract](contract.md#workflow-and-table-contract). `gtm check` reports `missing_terminal_bookkeeping` when the workflow bypasses `runRows()`, but review the supplied `table.save` callback manually.
- Credential-free adapter input. Canonical adapter input must exclude credentials under [paid calls](contract.md#paid-calls). Review manually.
- Reachability. The exported workflow, route, schedule, and trigger path must agree under [the workflow contract](contract.md#workflow-and-table-contract) and [runtime identity](contract.md#runtime-and-run-identity). `gtm check`: `invalid_export`, `invalid_input_parse`, `invalid_rows_input`, `invalid_workflow`, `invalid_module_scope`, and `nondeterministic_workflow` where applicable.
- Result keys and timestamps. Every workflow-owned result table must have primary key `key` and non-null `updated_at` under [the workflow contract](contract.md#workflow-and-table-contract). `gtm check`: `invalid_result_table`.
- Agent context. Every `agent()` call must receive the accepted ICP or persona text as `context` and stable source paths as `contextId` under [paid calls](contract.md#paid-calls). Review manually.
- Scheduled deduplication. Scheduled work must keep its cron, `scheduledInput`, `scheduled_for`, and downstream date key aligned under [runtime identity](contract.md#runtime-and-run-identity). Review manually.
- Held-run errors. Adapters must throw `ProviderAuthError` for authentication failures and `ProviderQuotaError` for account limits under [adapter error and retry behavior](providers.md#empty-error-and-retry-behavior). Review adapter branches and fixtures manually.
- Managed header and version drift. Managed files must carry the current header and recorded hash under [versioned files](contract.md#versioned-files). `gtm check`: `lib_version_mismatch`, `lib_hash_missing`, and `lib_modified`.
- Migration integrity. Generated SQL, journal entries, and snapshots must stay registered under [safety and persistence](contract.md#safety-and-persistence). `gtm check`: `invalid_migration_artifacts` and `destructive_migration`.

## SHOULD FIX

- Fixture coverage. Every adapter endpoint should cover canonical input, success, provider-specific empty, permanent failure, supported retry behavior, reported cost, and asynchronous completion where used under [fixture-first tests](providers.md#fixture-first-tests). `gtm providers list` reports whether the adapter has any fixture coverage; review endpoint completeness manually.
- Provider discovery. A new adapter should exist only after `gtm providers list` finds no reusable endpoint under [adapter contract](providers.md#adapter-contract). Review the command result and overlapping headers manually.
- Partial-failure recovery. Row workflows should preserve meaningful keys in paid calls so `gtm runs get --failed` and `--rows-from-run` can recover the failed scope under [runtime identity](contract.md#runtime-and-run-identity). Review the dry run and one fixture failure manually.

## NICE TO HAVE

- Operator diagram. Operator-named steps should produce a legible `gtm diagram <slug>` without implementation-only names under [the workflow contract](contract.md#workflow-and-table-contract). Review the Mermaid and ASCII output manually.
- Receipt quality. A fixture run should produce a useful hit rate, estimate-versus-actual reason, cost-source breakdown, cache-hit count, and next command under [runtime identity](contract.md#runtime-and-run-identity). Review `gtm runs get <runKey> --format markdown` manually.
