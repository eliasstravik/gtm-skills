# gtm-workflow requirements and assertions

## Shared contract

- **C01** Resolve request-named, environment-connected, then canonical `~/.gtm/` workspaces; configuration and visibility are node-local.
- **C02** Dereference workflow record → named target → target prose for every operation; a suborganization binds only to its own node's registry.
- **C03** Begin a question-bearing message with one bold question, combine compatible missing business decisions, use numbered choices with at most option 1 `(Recommended)`, end discrete choices with the exact reply line, and never use `AskUserQuestion`.
- **C04** Keep exactly setup, create, update, inspect, delete, and run. Publish is update; node health is no-argument inspect.
- **C05** Viable targets expose author, run, and inspect operations; invoke-only or data-only tools are connections.
- **C06** Mutations follow design → validated target draft and actual diff → concise behavior and affected-path approval → exact reviewed write → consequential go-live. No created target artifact remains record-less.
- **C07** Secrets remain outside the workspace. Tracked content is authored; SQLite, outputs, runs, logs, and caches are gitignored working state.
- **C08** External-write or material-cost runs preview scope, destination, target-native estimate, limits, and a pilot option. Local and read-only runs are ungated.
- **C09** Accepted tracked changes stay on `main`, match the internally reviewed draft and user-visible behavior/path summary, touch only accepted paths, and close as “saved to history.”
- **C10** Create and update state exact draft/live status; deferral on draft/publish targets warns that live still runs old logic.
- **C11** Local guidance keeps workflow kind on-demand under external scheduling, recommends SQLite due-row state for sweeps, graduates repeated provider calls into tracked typed wrappers, and keeps row loops and intermediate data out of agent context.
- **C12** Local guidance uses an existing viewer instead of custom UI, renders a four-to-eight-node business-process Mermaid diagram by default, and keeps lightweight run/item observability while hiding storage, model, telemetry, and process details from nontechnical users.
- **C13** Default conversation names Local or runs on this computer, asks only for missing purpose, inputs, result, timing, changed systems, limits, and meaningful failure behavior, and infers implementation choices from target prose.
- **C14** Save proposals cover behavior, inputs, outputs, changed systems, location, timing, limits, failure behavior, validation, affected paths, and resulting state without source, schemas, fixtures, tests, config bodies, diffs, ignore-file bodies, or complete files.
- **C15** Run and inspect reports lead with business outcomes, failures, external changes, saved results, and relevant cost. Diagnostic identifiers, raw paths, product names, ports, commands, and telemetry remain optional technical details.
- **C16** An explicit request for code, storage, models, logs, architecture, or developer details receives accurate technical information without weakening approval, cost, publishing, permission, or deletion gates.

## Scenario coverage

- E1 proves setup viability and invoke-only classification.
- E2 proves additive multi-target setup and preservation.
- E3 proves nontechnical Local selection, one-message design intake, concise approval, and internally reviewed implementation.
- E4 proves triggered-local refusal and infrastructure go-live.
- E5 proves app-target go-live for on-demand work and cancellation cleanup.
- E6 proves external-write cost, limit, and pilot gating.
- E7 proves ungated local execution and ignored output.
- E8 proves mutation-free single-workflow inspection.
- E9 proves no-argument health reporting and one accepted repair set.
- E10 proves combined workflow/registry update, stale-live deferral, and bare publish routing.
- E11 proves record-only unmanagement and the bound-target deletion guard.
- E12 proves a mutation-free four-to-eight-node business diagram and partial-failure caption.
- E13 proves a human-readable private saved-results link and plain sharing handoff.
- E14 proves progressive disclosure of accurate technical details to an expert.
