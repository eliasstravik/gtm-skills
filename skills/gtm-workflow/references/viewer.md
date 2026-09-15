# Workflow viewer

## Inspect without execution

Run `npm run viewer` against an existing local `data/gtm.db`. It binds to `127.0.0.1`, rejects unexpected Host/Origin values, disables active-run recovery, and builds only viewer routes. It starts no schedules, intake, providers or runs. `npm run dev` is the separate deliberate execution command. Initial setup explicitly migrates the business database, runs `npm run viewer:register`, builds display metadata, and runs `node scripts/viewer-migrate.mjs` before opening the viewer.

The workspace list opens Diagram, Runs and current business Data. Run payloads are retained inputs/outputs, not snapshots of current tables. Runs and steps are paged; large payloads are visibly truncated. Locked/unavailable payloads remain distinct. Old runs without a retained graph keep their trace and do not receive the current graph's execution overlays.

## Author and preserve metadata

Every registry entry has `viewer: {id: <UUID>}`. Assign a new identity with `npm run viewer:register` only for newly created entries. Preserve it through renames and upgrades. Reusing a deleted slug means a new identity, never copying its old grant scope. Keep `viewer`, `data`, `intake`, imports and authored workflow/table files when updating the runtime.

The compiler supplies each workflow's graph and exact step IDs. Check its output: callbacks and shared helpers can hide relevant structure. Author a literal `viewer.graph` when needed, using `Graph` from `lib/viewer-contract.ts`; readable nodes describe real call sites, conditions, loops, parallelism, waits and child runs. Display metadata never changes execution. Imported literal metadata files are supported. `viewer.mappings` can bind a node to an exact step name plus a saved-input argument selector such as `{path: ['args', 0], equals: 'people'}`. Repeated calls without a unique verified selector stay unmapped. Never map by runtime order or mark an unmapped node completed/skipped.

Builds validate step/edge references, hash authored source, and retain the graph in database metadata with workspace, environment and deployment identity. A run uses only its matching artifact. Review metadata again whenever the code changes.

## Private access and machine access

Hosted private access is native Vercel Authentication with All Deployments. `GTM_VIEWER_PROTECTED=1` is set only after verifying that platform setting; it is not a replacement login mechanism. Private same-origin share mutations require a CSRF cookie and header. The viewer has no run, cancel or approve controls.

Prepare the agent's `GTM_WORKFLOW_BYPASS_SECRET` and `GTM_WORKFLOW_GATE_REQUIRED=1`, preserving its execution bearer and exact `GTM_WORKFLOW_URL` origin. Deploy the upgraded agent before enabling protection. Its host injects both credentials only toward that origin; never expose them to model-visible exports, frontend assets, user links or logs. Verify harmless Queue/wait resumption, cron and signed intake before rollout. External intake still verifies the sender signature and deduplicates event IDs; its sender also needs verified gate transport. Doctor must never turn protection off to fix access. Retain a tested prior deployment for rollback while preserving the gate.

## Explicit public sharing

Create a same-source companion Vercel project in the same team, root `workflows/`, build command `npm run build:share`. Give it only `GTM_VIEWER_PRIVATE_ORIGIN` and `GTM_VIEWER_PRIVATE_PROJECT_ID`; no Turso, run, cron, provider, GitHub or administration credentials. Its build omits Workflow handlers, cron configuration, migrations and database imports. Configure it as a Trusted Source of exactly its own private project, production-to-production. The fixed GET proxy forwards its short-lived Vercel OIDC identity server-side. Callers cannot choose an upstream origin, route, method or headers. Verify the build output and live proxy before enabling `GTM_VIEWER_SHARE_ORIGIN` on the private runtime.

Private users create links in Share. Choose any nonempty combination of Diagram, Runs and Data. The initial view follows the current context, otherwise Diagram. Expiry options are 1, 7, 30 days and Never; seven days is the default. Runs exposes retained and future execution identity, timing and status, with generic failure summaries. Raw inputs, outputs, errors and arbitrary attributes stay private even when Data is also granted. Data reads current records through its configured policy. No expiry is explicit; revocation takes effect on subsequent requests and open tabs refresh authorization. Each random bearer is stored only as a hash and bound to one immutable workflow identity, workspace/project and environment. URL fragments carry the bearer; requests use a header and no-store/no-referrer. Native Vercel deployment-wide share links are broader access and must not be used as this product's grants.

Data sharing additionally requires `viewer.sharePolicy: DataPolicy`: stable table IDs, allowed columns, allowed relationships and a versioned row restriction. `{version: 'all-rows-v1'}` explicitly allows all rows of that registered view; `{version: 'team-v1', column: 'team', equals: 'sales'}` restricts rows. Include link-table keys, displayed label columns and primary keys in the allowed columns. The policy must cover each registered table and through-table. A changed schema mapping, allowed column, relationship or row policy invalidates the entire affected grant until a new one is issued. New values and rows inside an unchanged policy remain live.

Private links returned by `/api/link/<slug>` point to `/viewer?workflow=<id>&view=logic|runs|data`. Creating or deploying a workflow does not authorize creating a public share grant. Legacy signed diagram/data URLs redirect to the private viewer and do not bypass authentication.

## Business stages and results

Author `viewer.stages` beside the workflow: stable stage `id`, `title`, short `description`, and `nodes` containing exact graph node IDs. Build rejects missing labels, unknown members and duplicate assignments. Keep conditions, waits, loops and parallel edges visible. Do not group unrelated nodes into an invented sequence. Without authored stages the viewer explicitly shows the structural graph.

Data queries accept allowlisted `q`, `field`, `operator` (`eq`, `ne`, `gt`, `lt`, `missing`), `value`, `sort`, `order`, and `page`. `columns` controls CSV presentation only. Optional `data.tables[].fields` supplies field labels and types. Exports read every matching page, check grant validity before each page, escape CSV and neutralize formulas. They are live paginated reads, not snapshots; clients show start and completion time.

Run summaries scan bounded pages independently of the selected invocation page. They say partial when the bound is reached. Child runs remain separate from root history; unknown lineage stays unavailable.

## Upgrade and rollback

Merge the template-owned files and dependencies, preserving authored workflows, metadata, tables, IDs, data, migrations and environment settings. Build the viewer and run the explicit metadata migration. Deploy private and share targets from the same revision. Verify the private Vercel gate, recipient projections and the installed agent release pin before returning new entry links.

The metadata migration is additive and idempotent. Retain the previous private and share deployment IDs. Roll back both applications together against the same database; do not drop metadata tables or reset business records. The prior viewer required Diagram scope, so newly issued Data-only or Runs-only links may be unavailable after rollback until reissued or upgraded again.

The hosted authenticated service adapter is `/api/viewer/service?v=1&workflow=<id>&op=<operation>`. Browser mutations keep their Origin/CSRF requirements; service mutations require the existing host credential plus Vercel gate access. Replacement creates and revokes inside one transaction; failure preserves the old link. Preview uses recipient projections without minting a bearer.
