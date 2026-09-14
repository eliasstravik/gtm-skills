# Network enrichment recipe

## Resolve input and services

Record the source, network owner/platform/kind when relevant, input identifiers, person service, company service, current-experience limit, refresh policy, and row/spend caps in the generated workflow's configuration and doc comment. The services have no prescribed vendor, aggregator, transport, or platform. Use each chosen service's documented API; no placeholder endpoints or prices in runnable code.

For a CSV, inspect the real columns and normalize rows outside the workflow, then submit rows to an import step that persists them in the workflow database before enrichment. Large imports are bounded batches with stable source-row keys. Future runs read the saved input table. Never commit the CSV or imported personal data to the repository, depend on an expiring Slack attachment URL, or make a hosted run read the conversation's filesystem. `POST /api/query` is read-only; writes happen inside workflow steps. The source table is an implementation detail in addition to the three result tables below.

For an existing database/table, preserve its rows and use a read-only source adapter. For a retrieval service, retain cursors and stable source IDs, bound page size/count and retrieval cost, and resume the existing job instead of purchasing a new scrape after a timeout. A one-person test must not silently purchase a whole network export; include any minimum retrieval charge in the stated test cost.

Person lookup inputs must meet the chosen service's identity requirements. Prefer a stable platform profile ID or normalized profile URL; validated email may serve when supported. Preserve aliases so the same person arriving in a second import maps to the existing person. Insufficient identity remains a visible source-row status rather than an invented match.

## Data contract

Prefix all physical table names with the workflow slug using underscores. Use stable `key` values and `gtm-workflow`'s `updated_at`, `cost_usd`, and `error` columns on every result table. Separate `enriched_at` from `updated_at` so a failed attempt does not make old data fresh.

| Table | Required workflow-specific content |
| --- | --- |
| People | Canonical identity and aliases; source identity; name/profile URL; normalized person profile; full employment history; match/enrichment status; successful enrichment time; selected and omitted current-experience counts; evidence/provider provenance |
| Companies | Canonical company identity and aliases; name/domain/profile URL when known; normalized company profile; match/enrichment status; successful enrichment time; evidence/provider provenance |
| Employment links | Stable experience identity; person key and company key as foreign keys; title; start/end dates; current-status evidence; selected rank; observation time |

The employment table has a unique identity per person and experience. Two current titles at the same company remain two experiences while pointing to one company record. Companies without a confident match remain unresolved; company names alone do not identify legal entities. Prefer the provider's stable company ID, with verified domain/profile aliases for cross-provider matching. Create a company placeholder for a resolved employer identity before enrichment, so a provider failure does not lose the relationship.

Raw responses, if retained, stay in the database with provenance. Expose useful profile and status columns in the data page; omit raw response blobs, provider traces, and secrets. Company spending is recorded once on the company lookup, not copied into every related person's cost. Report source, people, and company totals without double-counting reused results.

## Current experiences

`maxCurrentExperiences` defaults to 5 and accepts a positive integer. Validate it before any paid call; an override also changes the pre-run cost estimate.

1. Normalize each provider's explicit current flag, present marker, and date semantics. An absent end date alone means current only when that provider documents it that way. Conflicting or insufficient evidence is unknown, not a current employer.
2. Remove duplicate copies of the same experience using its stable ID, or person/company/title/start date when no ID exists. Retain separate roles at the same company.
3. Order confirmed current experiences by explicit primary role first, then newest known start date, then stable experience identity. Keep the first `maxCurrentExperiences`. Preserve unknown roles and all other history in the person profile, with an omitted-current count when capped.
4. Resolve companies for the selected experiences and deduplicate the company worklist by canonical company identity. Reuse the company row while retaining every selected experience link. Do not silently substitute older employment when current work is unknown.

On a successful refresh, replace that person's selected links transactionally with the newly confirmed selection. A failed or ambiguous refresh retains the last successful profile/links and marks them stale. A changed cap recomputes selection from stored history; it does not require another paid person lookup. Lowering the cap removes only links outside the new selection, not companies or another person's links.

## Execution and spending

Build one user-facing orchestration with source import/read, a people phase, a deduplicated companies phase, and completion reporting. The people phase persists profiles and employer work before company calls start. Company failure never rolls back a successful person enrichment. A resumed run considers pending companies even if every selected person is fresh.

Use `runRows` for each phase's row processing. Its built-in fan-out calls the **same function** with child rows: a people worker must only do people, and a company worker must only do companies. Register phase workers separately and have the orchestration start and await them using native Workflow child runs/hooks. Never point both phases' fan-out at the whole orchestration, which would repeat source acquisition and company work in every child. Record child IDs through the runtime's cancellation mechanism so cancelling the user-facing run cancels its children. Keep provider I/O, database reads/writes, and polling as durable steps; paid calls have `maxRetries = 0`.

Allocate one overall budget before starting phases. Bound source retrieval first; reserve enough for each admitted person plus up to the configured number of company lookups. Pass phase budgets explicitly, account for real costs, and pass only the unspent total to later work. Independent default budgets on two `runRows` loops would double the user's cap. The existing row loop uses estimates to admit work, so use documented maximum charge per lookup, including any allowed fallback/polling charges, as its admission estimate. If an API cannot provide a bounded charge, do not claim a hard dollar ceiling; offer a bounded alternative or get the user's explicit acceptance of an estimated limit before running.

`maxRows` in the user-facing workflow counts unique people. Company work is bounded by those people's selected experiences, at most `maxRows × maxCurrentExperiences`, and the remaining budget. Filtering the company phase must use this run's selected people/work items, not every company in the workspace. Fresh selected people may still supply missing company work. A one-person test applies the same graph and budget rules to one person.

Deduplicate companies across the complete selected people set before fanning out company workers. The runtime's `cached()` performs read → call → write, so it is **not a concurrency lock**. For overlapping runs, use database-backed ownership of each provider/company/freshness work item, claimed atomically before buying enrichment. A waiting run reuses the owner's result. Use the provider's idempotency/job identifier where supported; an uncertain paid request becomes pending reconciliation and is not bought again automatically on lease expiry. A workflow-level single-flight lock is an acceptable simpler alternative when serialized runs meet the request. Release ownership on every terminal path; recover abandoned owners by inspecting run/provider status, not by assuming no charge occurred.

Set and explain a freshness policy when creating the workflow; reuse the same stored profile for a changed experience cap. Cache paid misses as well as hits according to that policy. A provider failure, a no-match, ambiguous identity, and budget-skipped work have separate statuses. Finish with people done/failed/skipped, companies done/failed/reused/pending, unresolved relationships, and actual or explicitly estimated spending.

## Browsing and lifecycle

Register the People and Companies views with an employment relation using [linked data](../../gtm-workflow/references/linked-data.md). The viewer reads both directions from the one link table and paginates shared employers. Include linked names as well as identifiers. New workflows get their own tables; existing workflows retain names and data during updates.

The recipe owns no schedule by default. Follow `gtm-workflow` when the user asks for a recurring run, changes a provider, or deletes the workflow. Preserve provider-independent identities when changing services, recalculate prices and credentials, and offer the dependency's limited test before bulk execution. Delete the workflow and schedule while retaining its data, as the dependency specifies.
