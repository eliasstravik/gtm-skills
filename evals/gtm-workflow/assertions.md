# gtm-workflow requirements and assertions

## Shared contract

- **C01** Resolve request-named, environment-connected, then canonical `~/.gtm/` workspaces; configuration and visibility are node-local.
- **C02** Dereference workflow record → named target → target prose for every operation; a suborganization binds only to its own node's registry.
- **C03** Ask one bold question per message, use numbered choices with at most option 1 `(Recommended)`, end with the exact reply line, and never use `AskUserQuestion`.
- **C04** Keep exactly setup, create, update, inspect, delete, and run. Publish is update; node health is no-argument inspect.
- **C05** Viable targets expose author, run, and inspect operations; invoke-only or data-only tools are connections.
- **C06** Mutations follow design → validated target draft → accepted actual record/config/local-script bytes → consequential go-live. No created target artifact remains record-less.
- **C07** Secrets remain outside the workspace. Tracked content is authored; SQLite, outputs, runs, logs, and caches are gitignored working state.
- **C08** External-write or material-cost runs preview scope, destination, target-native estimate, limits, and a pilot option. Local and read-only runs are ungated.
- **C09** Accepted tracked changes stay on `main`, match complete previews, touch only accepted paths, and close as “saved to history.”
- **C10** Create and update state exact draft/live status; deferral on draft/publish targets warns that live still runs old logic.
- **C11** Local guidance keeps workflow kind on-demand under external scheduling, recommends SQLite due-row state for sweeps, graduates repeated provider calls into tracked typed wrappers, and keeps row loops and intermediate data out of agent context.
- **C12** Local guidance uses existing SQLite viewers instead of custom UI, renders workflow structure as on-demand Mermaid, and keeps lightweight run/per-row observability in SQLite while deferring step timelines and live dashboards to infrastructure targets.

## Scenario coverage

- E1 proves setup viability and invoke-only classification.
- E2 proves additive multi-target setup and preservation.
- E3 proves quick-local registry materialization and acceptance-gated script bytes.
- E4 proves triggered-local refusal and infrastructure go-live.
- E5 proves app-target go-live for on-demand work and cancellation cleanup.
- E6 proves external-write cost, limit, and pilot gating.
- E7 proves ungated local execution and ignored output.
- E8 proves mutation-free single-workflow inspection.
- E9 proves no-argument health reporting and one accepted repair set.
- E10 proves combined workflow/registry update, stale-live deferral, and bare publish routing.
- E11 proves record-only unmanagement and the bound-target deletion guard.
