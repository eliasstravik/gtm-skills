# Shared profiles

Use this contract whenever a workflow persists enriched people or companies. Register exactly two canonical entity tables, `people` and `companies`. Keep imports, research/qualification context, runs and paid attempts in operational storage.

## Storage and updates

`templates/lib/profiles/schema.ts` defines all 80 People and 68 Companies columns. The [field dictionary](profile-fields.md) and [machine-readable inventory](profile-field-inventory.json) define their meanings and provider destinations. Optional contact, technology and financial fields store returned data; their presence does not authorize extra purchases.

Use `resolveIdentity`, `applyEvidence`, `getProfile`, `isFresh`, `recentMiss` and `currentCompanies` from `lib/profiles/store.ts`. Call database operations inside durable steps. Provider adapters return typed fields, explicit section coverage and the complete original response envelope. Keep unmapped data in that envelope, without credentials or transport headers.

Internal keys are generated and stable. Platform namespaces and identifier string precision survive normalization. A URL can establish a provisional person. A company domain plus a matching name can establish provisional lookup evidence; conflicting platform evidence remains ambiguous. A domain alone or a name alone never reconciles conflicting companies. Imported email is source input, not a global person identity.

Turso bills every row a query scans ([cost-aware design](cost.md)). Every lookup must be an index search, never `json_each` over a profile column in a per-record query. The JSON columns stay the full record. Three side tables index what is looked up: `profile_identifiers` (aliases from `identifiers_json`), `profile_memberships` (workflow membership from `sources_json`) and `person_companies` (employment from `experiences_json`). Database triggers rebuild a profile's side rows whenever one of those columns changes, so they stay exact for every writer, including merges, hand-written SQL and an older runtime during a rollout. `profile-migrate.mjs` creates them and backfills each once per database (`schema_backfills`). The profile tests run on the enforcing guard, so any full scan in this code fails them.

`sources_json` uses the viewer's permanent workflow UUID, source/import ID and source-row ID. Membership accumulates across imports; renaming a workflow does not change it. Provider provenance and network membership are separate.

Keep every role in `experiences_json`. Each role has an experience key, nullable company key, company evidence, title, precision-preserving dates and current/ended/unknown status. Confirmed current roles create company work. Historical roles may reuse resolved companies but never trigger new lookups. Multiple unranked current roles leave primary-company shortcuts null.

Only complete successful sections may replace accepted sections, including a confirmed empty list. Partial, truncated, null, missing, failed or unsupported sections retain accepted data and new raw evidence. `enriched_at` measures accepted enrichment; imports and membership writes do not refresh it. Cache recent no-match attempts separately. Retain envelopes supporting surviving fields and the latest envelope per provider/endpoint/mode.

## Execution

Use `profiles/ledger.ts` for durable workspace single-flight ownership, saved input/work lists, charge reservations and actual spend. Persist work before dispatch. Keep uncertain reservations after cancellation, timeout or process loss. Resume known provider job IDs; never turn lock expiry into permission to repeat an unsettled call. If the current inspected price has no defensible maximum for the request shape, defer the call.

The network helpers in `profiles/network.ts` implement admission, membership, company selection and safe result application. `profiles/provider.ts` implements the installed Monid transport with separate dispatch and polling. Provider semantics belong in `profiles/normalize.ts`; adding storage coverage does not add another paid provider.

Use separate people and company workflow workers in chunks of 100. Children process only their saved phase. One parent orchestrates import, people, company collection, companies and review. Both phases use the same ledger. Record child run IDs for cancellation. Paid steps have `maxRetries = 0`.

The default limits are 200 distinct people, $20 and 30-day freshness. They are configurable limits, not provider coverage or price guarantees. Report omitted inputs, person outcomes, distinct companies, current roles, unresolved employers, pending work and known/uncertain spend. A partially completed run is not fully enriched.

## Viewer and rollout

Generate static Data metadata with `node scripts/profile-view.mjs <workflow-uuid> workflows/<slug>.data.ts`. Import its literal `data` and `sharePolicy` into the workflow registry and viewer metadata. This retains the static registry reader while sharing the contract definition.

The bounded membership predicate reads `profile_memberships`, which mirrors `sources_json[].workflow_id`. The bounded relation reads `person_companies` for confirmed current roles, which mirrors `experiences_json[].company_key`. Company population derives from member people. Lists, counts, search, details, navigation and exports use the same predicate, including reverse links from shared companies.

Owners can select all canonical fields and deliberately include raw evidence. Shared policy version 2 restricts columns and scalar leaves of structured sections; source metadata, raw responses and internal provenance stay private. Contract version 3 rejects older clients. Changed policy fingerprints pause existing Data grants until the owner explicitly approves the new policy.

Keep `scripts/profile-migrate.mjs` in the build after Drizzle migrations. Add tables without copying historical rows or deleting old tables. Switch active readers and writers together. Run `tests/run.mjs <installed-runtime>` plus type/build checks, isolated hosted compatibility/scale checks and owner/shared UI checks before rollout. Fixture success proves behavior, not live provider coverage.
