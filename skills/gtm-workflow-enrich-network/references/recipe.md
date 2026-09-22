# Network enrichment recipe

## Resolve input and services

Record the source, supplied network owner/platform/kind, input identifiers, selected person and company services, freshness and row/spend caps. There is no prescribed vendor. The runtime ships two adapters, Monid (Clay and ContactOut) and Blitz; any other service is a plain provider-call step written against its documentation. Inspect current input/output semantics, full-section modes, pricing and authentication before authoring provider adapters.

CSV imports persist stable source-row identities before enrichment. Future runs read saved inputs; hosted runs never depend on the conversation's filesystem or an expiring attachment. Service imports retain cursors and provider job IDs. A one-person test includes any source minimum charge.

Names and email-only inputs remain operational source records until provider evidence establishes identity. An exact LinkedIn profile URL can create a pending person. A missing source or incompatible provider needs the user's choice; supplied choices require no repeated question.

## Shared data

Follow the runtime's [shared profile contract](../../gtm-workflow/references/shared-profiles.md) and its complete field dictionary. Use the shared API for every canonical write. Keep exactly two result tables, People and Companies, with workflow membership keyed by the viewer's permanent UUID.

Employment history belongs in `experiences_json` on each person. Preserve every returned role, including ended and unknown roles. Resolve every confidently identified current employer and retain pending company links before enrichment. Multiple roles at one company remain separate entries and create one company lookup. Unranked concurrent roles do not imply a primary employer.

Membership accumulates across imports. Companies shown for a workflow derive from current roles of its member people, so a later accepted job change updates every relevant workflow view. These views show current profiles rather than historical run snapshots.

## Execution and spending

The user-visible order is import → enrich people → collect current companies → enrich companies → review results.

Persist admitted inputs and selected work before spending. Defaults are 200 distinct people, $20 and 30-day freshness; retain configuration overrides. `maxPeople` limits people, and the saved budget limits company lookups. No current-role cap applies.

The workflow body is one call to `runNetwork` from `lib/profiles/network-workflow.ts` (see the shared profile contract): it imports, enriches people in chunks of 100 as child runs four at a time, collects current companies, enriches them the same way, and returns the summary. Child runs execute only their chunk of their phase; they never reimport or call the other phase. Every child works under the same durable run, lease and budget ledger, and is recorded for cancellation. Sketch:

```ts
export async function enrichNetwork(input: NetworkRunInput = defaultInput) {
  "use workflow";
  return runNetwork({ workflow: enrichNetwork, workflowId: WORKFLOW_ID, input, apiKeyVariable: "BLITZ_API_KEY", defaults: { maxPeople: 200, maxSpendUsd: 20, freshForDays: 30 } });
}
```

Reserve a documented maximum charge atomically before each paid dispatch. Record returned job IDs before polling. Unknown dispatch/charge status retains the reservation and defers work. Resume a known job; never repeat an uncertain purchase on lock expiry. A provider without a defensible maximum is deferred. Fresh reuse and recent misses cost nothing new.

Reads are budgeted: the runtime's helpers read the columns each step needs, count roles in SQL and never fetch a whole record per item, and `lib/read-budgets.ts` says what an enriched person, an enriched company, a listed row and a viewer call may cost in bytes out of Postgres. A workflow that adds its own reads (a filter over saved people, a report, a re-check) names columns with `getProfile(db, entity, key, { columns })` or `getProfiles`, aggregates in SQL, and is checked with `node <skill>/tests/run.mjs <workspace>/workflows --only read-budgets` and a local run under `GTM_DB_LOG_READS=1` before it ships; see [bytes out of the database](../../gtm-workflow/references/local.md#bytes-out-of-the-database).

Resume the saved people and company lists. A failed company does not require repurchasing its person's enrichment. Report person outcomes, unique companies, actual current-role count, unresolved employers, omitted inputs, pending work, and known/uncertain spend. Distinguish partial completion from fully enriched results.

## Viewer and lifecycle

Generate the two-table Data contract with `scripts/profile-view.mjs`. Default People columns show identity, headline, location, roles, followers, last enrichment and status. Companies show identity, domain, description, industry, size, LinkedIn employee count, headquarters, related people and enrichment status. Owners can select every canonical field and expand repeating sections.

Every list, count, search, detail, related navigation and export uses the same workflow population. Company-to-people navigation stays inside that workflow. Default exports omit raw evidence; owner inclusion is deliberate. Shared grants use the explicit column and nested-field projection.

Create new canonical tables additively and switch active readers/writers together. Leave old tables inactive. Bulk backfill, old-table deletion, extra contact discovery and new schedules require separate scope. Follow `gtm-workflow` for ordinary run and deployment decisions and the [acceptance cases](acceptance.md) for verification.
