# Changelog

## 1.0.0 - 2026-09-11

- Replace the workflow template's parallel orchestration paths with one Vercel Workflow runtime, one typed stage interface, one diagram specification, one startup migration path, and a small CLI.
- Remove the durable-agent runner, capability and event registries, preflight and execution wrappers, migration-ledger workers, redundant diagram renderers, and the former host-tool protocol.
- Rewrite the five skills around the same plain-language card-and-push flow for keyboard and hosted agents.
- Fix round after review: local runs no longer fail on the workspace-head check or an empty run secret (the first local command writes one); the run route stores the workspace commit and `GET /api/runs/latest` finds the newest run for it; `gtm run --background` returns at once for hosted creates; a failed row keeps its plain reason on the run; `agentStage()` runs locally on Claude Code with a budget cap and MCP-only tools, and refuses on Codex; migrations retry through a locked database so several instances can boot at once; the command classifier no longer lets `~`, `$VAR`, globs, `git add -A`, `git branch -D`, or writes to `.npmrc` through; `check` reports pending migrations from the ledger when there is no remote; the local server binds to loopback; `help` lists every flag.
- Tests: head check, local secret, CLI helpers, migrations including two concurrent processes, classifier corpus of 90 commands, diagram header parsing, row failure surfacing, model cache. CI runs them and the Python checks.

## 0.9.0 - 2026-09-10

- Define the decision message: the numbered options answer the bold lead question, bullets state defaults or facts and never ask, and a message asking for a typed fact has no numbered block. Grouped intake questions and the owner-choice numbered block are replaced by stated defaults.
- Decision messages count toward the 280/500 ordinary budget. Add the outcomes-not-mechanisms word table and extend the cut list to explanations of how the agent works or why a default was chosen.
- Run location is asked only on a keyboard, as the lead question with hosted and this-computer options; hosted surfaces always author `Runs: on Vercel` and never mention `on this computer`. Workflow library generation stays 23; no managed-file change.
- Skill evals, description optimization, and new tests were skipped at the user's request.

## 0.8.0 - 2026-09-10

- Add `gtm verify <slug> --input <file>`: one command for the offline check, the build initialization check, the zero-spend dry run, and the diagram export, with the first failing stage in one JSON result. Workflow library generation 23; no schema change and no managed-file behavior change beyond the new command and the alias warning wording.
- Reshape create and update around the user's waiting time: every open decision is asked in one grouped message before any reference reading, scaffolding, or code, and the build phase runs unattended to the approval gate. References are read once, concatenated, after decisions settle; the bundled runtime docs are consulted only for building blocks the composition reference does not cover.
- The host contract requires `gtm verify` before any save proposal and states the decide-first, build-async shape. Skill evals and description optimization were skipped at the user's request.

## 0.7.0 - 2026-09-10

- Default short API model steps to DeepSeek V4.1 Flash with high reasoning. Add per-call model and reasoning choices, expose them in diagrams and previews, and rename the project default to `GTM_WORKFLOW_MODEL` with a generation-22 deprecation warning for `GTM_AGENT_MODEL`.
- Add credential-free row fixture checks and bearer-protected deployed preflight for adapter environment names, result tables, and declared free auth checks. Propose a separate one-row smoke run after the accepted version is live.
- Add host-side scratch-draft PNG rendering, summary strips, numbered business steps, provider/model and row costs, decision questions, table names, and status legends. Require draft pictures and links before approval, with revisions and background deployment/run follow-ups in the originating Slack thread.
- Set concise message budgets and exact save/failure/live wording. Require human-only, nonempty approval text and one approval covering each complete plan's calls, effects, and total cost.
- Ship workflow library generation 22 without a schema change; preserve bounded concurrency, child batches, deployment pinning, workflow shapes, and the Eve reference.
- Skill evals, benchmarks, trigger optimization, and eval evidence updates were skipped at the user's request. Verification uses offline compatibility, template build/check, deterministic fixtures, and diagram review.

## 0.6.0, 2026-09-10

Workflow library generation 21.

- Workflow guidance resolves recopy targets and managed headers from the template generation. The offline compatibility check catches stale numeric targets and runs with regression tests in CI.
- Authoring recipes cover batch rows, scheduled scans, one long-lived run per entity, and fixed pipelines with durable agent stages. Update proposals explain deployment pinning for waiting runs.
- A dated Eve reference distinguishes hosting-agent capabilities from workflow resources and routes source changes through the host's declared permissions. Provider guidance clarifies step identity for idempotency and permanent errors under default retries.
- Row workflows gain bounded concurrency with shared paid-call admission, batch-boundary checkpoints, and independent row failures. Child batches share the parent budget, propagate cancellation and deadlines, and expose child status in receipts and diagrams.
- Agent deadlines use isolated durable timers that finish with the stage; cleanup does not wake parallel workflow delays. A local mock-model fixture covers early completion, expiry, and parallel stages.
- Existing projects need the managed recopy and the additive `parent_run_key` migration. Runtime dependency pins and the skill description are unchanged. Skill evaluations and description optimization are excluded.

## 0.5.3, 2026-09-10

Workflow library generation 20.

- Migration generation returns structured schema decisions without terminal prompts, stages artifacts until success, and stops hung generators after 60 seconds.
- Generation refuses a snapshot that has lost the shared runtime tables. Migration recovery guidance covers ambiguous changes, snapshot drift, and timeouts. Existing projects must use the managed `db:generate` helper; no schema migration is required for this update.

## 0.5.2, 2026-09-09

Workflow library generation 19.

- Read-only MCP tools can accept narrowly specified no-match responses with `recoverableErrorSchema`; unrecognized failures still stop without retries.
- Failed MCP attempts preserve bounded, redacted provider diagnostics in the trace and ledger.
- Authoring guidance covers no-match handling, endpoint bindings, and provider search limits. No schema migration is required.

## 0.5.1, 2026-09-09

Workflow library generation 18.

- Builds initialize the compiled workflow bundle without credentials or step execution, catching Node-only imports before deployment.
- Row workflows support delivery after saving and before completion through `afterSave`; delivery failures remain failures. Diagrams include the callback.
- Authoring guidance requires the runtime check and keeps authentication SDKs inside steps.
- Existing projects need the managed update and build-command suffix; no schema migration is required. Skill evaluations remain excluded.

## 0.5.0, 2026-09-09

Workflow library generation 17.

- Workflow authoring selects ordinary steps, durable agent stages, or a mixture, with explicit native composition and extension guidance.
- Durable agents use selected MCP/HTTP tools and committed skill content, structured results, call limits, per-attempt accounting, and atomic spending reservations. Previews disclose estimated costs and bind the capability definition.
- Signed event sources start new runs with permanent deduplication and daily admission limits. Existing hooks continue to resume waiting runs.
- Workflow diagrams recognize dynamic agent stages and durable sleeps. The validator rejects durable agents inside steps.
- Existing workflow projects require the managed runtime update; no database schema change is required. Credentials, live event subscriptions, and workflow-owned definitions stay deployment-specific.
- Skill evaluations and description optimization are excluded at the user's request. Validation uses deterministic runtime fixtures, static skill checks, and builds.

## 0.4.4, 2026-09-09

Workflow library generation 16, unchanged.

- Hosted workflow diagrams combine the caption, picture, and links into one message instead of posting the caption separately.
- Validation used offline repository and compatibility checks. Evals were skipped at the user’s request.

## 0.4.3, 2026-09-09

Workflow library generation 16, unchanged.

- When a hosted channel sends the workflow picture and Diagram/Runs/Data links, the assistant adds only a caption instead of repeating the links.
- Validation used offline repository and compatibility checks. Evals were skipped at the user’s request.

## 0.4.2, 2026-09-09

Workflow library generation 16.

- PNG diagrams load the bundled Inter font through the native renderer's supported `fontFiles` option. Temporary font files are removed after rendering, including on failure. This restores text in deployed diagram images without depending on installed system fonts.
- The hosted workflow link block labels its second line `Runs:`.
- Validation used focused PNG rendering and visual inspection, offline compatibility checks, and deployment builds. Evals were skipped at the user's request.

## 0.4.1, 2026-09-09

Workflow library generation 15.

- Remote read-only commands work in the hosted sandbox, where the firewall brokers the read-only credential and no token is present in the environment. Outside the sandbox a missing read-only token is still refused, and the write token is never used.
- Helpers called from the workflow body or used as the row step are drawn inline, so a row's stages, decisions, and error paths appear in the diagram and `gtm check` no longer asks authors to wrap them in one step. A step called from inside another step stays hidden and still fails the check.
- The deployed diagram page, JSON, and PNG routes work on Vercel. The build traces the TypeScript parser into the function instead of inlining the CommonJS package into the ESM bundle, where it threw `__filename is not defined` and returned 500.
- The diagram reads the documented `Result table:` workflow header as well as `Table:`, so a workflow written to the contract names its table on the page.

## 0.4.0, 2026-09-09

Workflow library generation 14.

- Every workflow has a real graph: the diagram command extracts steps, decisions, loops, parallel groups, and error paths from the workflow body instead of listing step names. Mermaid and ASCII render that graph; `json`, `svg`, `png`, and `web` formats are new.
- The workflows project serves a signed diagram page, graph JSON, and a PNG at `/gtm/diagram/<path>`, `/api/diagram/<path>`, and `/api/diagram-image/<path>`. Links are signed with the run secret and expire after 24 hours.
- Authoring rules: every step carries a JSDoc label, steps are called from the workflow body, decisions and loops may carry a naming comment, and `runRows()` marks stages as run attributes. `gtm check` fails with `diagram_rules`, one line per finding with its fix. Existing workflows fail until fixed.
- The workflow flows show a "Where to look" block (diagram, runs, data) at defined moments, and the shared interaction standard gains the matching carve-out.
- Deployed projects must set Vercel Authentication to preview deployments only, or attach a production custom domain, so diagram links open without a Vercel login.
- Prospect qualification renders the verdict first: labelled Verdict, Score, Confidence, Scored against, and Reasoning lines for one entity; one table per mode plus a reasoning line per entity for several. The agent still composes the reasoning and band before writing any visible line.
- Validation: `node --test evals/gtm-workflow/scripts/test-templates.mjs`, the offline layout and compatibility checks.

## 0.3.2, 2026-09-09

Workflow library generation 13, unchanged.

- The shared interaction standard now names the only two ways to ask for a decision: the gate (native approval control, or the numbered `Save this?` block on a keyboard) for any durable action, and a numbered choice block with option 1 `(Recommended)` for everything else. Open questions are for typed facts only. Yes-or-no questions, `Shall I…?`, and invented confirmation phrases such as `Say "add them"` are banned.
- Once a proposal's facts are in hand, the next assistant action is the gate. No readiness or research-complete message precedes it.
- Validation used the offline repository and compatibility checks only; no eval was run or updated for this release.

## 0.3.1, 2026-09-09

Workflow library generation 13, unchanged.

- The shared interaction standard gains a length and formatting section: one sentence per line, at most 12 body lines per message, bulleted lists for three or more parallel items, one bold lead line in ordinary messages, and a cut list (sentences about what does not change, research method or sources, restore reminders outside a delete closing, the adjectives researched, complete, and full, restated requests).
- Proposal shape is now an opener line, the artifacts one per line, and at most three lines of defining facts, with shared facts stated once for the batch under `All:`. Deletions list the names and end `They will no longer be available.` Closings use the same shape in the past tense with `Saved.` on its own line; a delete closing may add one restore sentence.
- Hosted approval text may use `- ` bullet lines; the host contract says so and renders them as bullets.
- ICP, persona, workspace, and workflow flows point at the new shape instead of "two to four lines" per artifact; the workflow save proposal is one bulleted list (does, reads, runs, costs, writes, checked).
- Validation used the offline repository and compatibility checks only; no eval was run or updated for this release, so eval assertions may lag the new proposal shape.

## 0.3.0, 2026-09-08

Workflow library generation 13, unchanged.

- Added the shared interaction standard at `skills/gtm-workspace/references/interaction.md`, referenced by all five skills. It owns audience language, proposal shape, batching, grouped questions, approval by surface, and closing language; each skill keeps only its own vocabulary and flows.
- Proposals are now short plain-language summaries per artifact, identified by display name plus owner chain (`National Insurers (Nimbus Labs › Enterprise)`). Complete files, before-and-after bytes, diffs, code, and SQL appear only when the user asks. Updates state changed facts as `was X, now Y`; deletions state the name and effect; destructive migrations state the table or column and the rows affected in words.
- Batching: several supplied ICPs, personas, members, or suborganizations are drafted and saved in one proposal and one durable change. No skill offers a suggest or brainstorm step.
- Grouped questions: every missing result-changing fact is asked in one message (one bold lead question, bulleted facts, at most one numbered block). Anything not asked is drafted as `Unknown`. `gtm-workspace` create is now one intake message, one research pass, one proposal, and one save.
- Single hosted approval: on a surface that declares a native approval control, that control is the proposal and the only gate. The whole proposal goes into the write control's `summary` (plain text, up to 2,500 characters, first line `For <root display name>:`, last line the action's closing line). Keyboard surfaces use one shape for every skill: `**Save this?**`, the summary, then `1. Save (Recommended)`, `2. Change it`, `3. Cancel`.
- Plumbing language is out of GTM content flows: no git, GitHub, commit, push, pull request, branch, hash, path, label, manifest, tool name, command, or run identifier in user-facing text. Flows close with `Saved.`; hosted workflow saves add `It will be live in production in a few minutes; ask me to check.` Import, sharing setup, whole-workspace deletion, and git-problem recovery may still name GitHub and the repository.
- `docs/gtm-agent-requirements.md` gains a conversation contract for hosted surfaces: the host declares the approval control and its 2,500-character plain-text limit, renders only `summary`, checks the closing line deterministically, and reports success without commit URLs or paths.
- Evals, assertions, and graders were rewritten for the new proposal and question shapes, with a batch case and a hosted native-approval case per lifecycle skill. Validation used the offline repository and compatibility checks only; no model-run eval was executed for this release.

## 0.2.1, 2026-09-05

Workflow library generation 13, unchanged.

- Hosted workflow saves now explicitly construct the manifest from the final write/delete payload, including migration files. Rejected requests are corrected and resubmitted for approval.
- The host contract requires validation before human approval and again before execution. Valid resubmissions still require approval.
- Validation uses offline repository and compatibility checks. Skill evals were not run for this release.

## 0.2.0, 2026-09-02

Workflow library generation 13, unchanged.

- `gtm-workspace` now creates a workspace in place on a hosted surface when the connected repository has no root `ORG.md` or legacy `org.md`, for example a repository created on GitHub with only a README. The Create flow runs with connected-repo substitutions: no git check, no local collision check, no git init or identity, no sharing question, and the first saved change writes `ORG.md` together with the contract files. The surface refusal now covers only connection changes: creating a different repository, import, sharing setup, and whole-repository deletion.
- Documented the host contract hosted deployments must satisfy.

## 0.1.2, 2026-09-01

Workflow library generation 13.

- `gtm check` now accepts a destructive migration whose first line is `-- gtm: destructive accepted`, so a drop accepted through the delete flow no longer fails every later check. Unmarked destructive SQL is still rejected, and the hosted save still requires the destructive declaration in its approval request.

## 0.1.1, 2026-09-01

Workflow library generation 12.

- Fixed `gtm check` misreading template literals and regular expressions inside function bodies. A workflow whose steps used `${...}` before the exported workflow function failed with a false `invalid_export`; the scanner now rescans template and slash tokens. Existing projects take the generation 12 recopy; no schema change is required.

## 0.1.0, 2026-09-01

First release under one project version. Earlier per-skill versions and `gtm-lib-v<generation>` tags are superseded; this release ships workflow library generation 11.

- Renamed the bounded qualification skill to `gtm-qualify-prospects` and classified it as the first Task Skill. It qualifies people against personas and companies against ICPs in session, with strict mode separation and no writes. Its authoring-time invariant places the numeric band mapping once, in Procedure.
- Session paid calls now allow exact-scope batch approval that states entities, capability, call count, effect, and stateable cost or explicitly says cost is not stateable; recurring or at-volume spend still graduates to `gtm-workflow`.
- ICP and persona descriptions now route saved-artifact qualification and scoring to `gtm-qualify-prospects`.
- New and fully researched member and persona artifacts now use the same eight-field person-data contract. Member email remains a separate supplied identifier and is never inferred.
- New and fully researched organization and ICP artifacts now use the same 13-field company-data contract, with explicit unknowns and separate employee-range, employee-count, location, and tech-stack shapes.
- GTM workspace creation can now skip member onboarding and continue directly to the sharing choice.
- Updated the pinned workflow runtime from beta.44 to beta.46 after the template suite passed on engine 22 and the forced webhook-resume probe passed on engine 24. The engine ceiling stays unchanged until the stable runtime declares support.

## Before 0.1.0: gtm-lib v10, 2026-08-28

- Cloud inspection now requires a read-only credential and rejects data-changing statements, including writes hidden behind a common table expression.
- Untrusted workflow content reaches only model backends that can disable tools. Accepted ICP and persona content now participates in the model cache key.
- Cancellation keeps the duplicate-run guard closed until the runtime confirms the run stopped. A run can also register its own runtime ID after a route interruption.
- Error text is redacted before it reaches ledgers, run records, route responses, or command output.
- The paid-call ledger opens a pending entry before a request. It distinguishes reported, fixed, and projected cost, records zero-cost pre-call failures, and reconciles abandoned calls.
- Approval hooks are single-use, local restart recovery does not repeat active paid work, and spend or mutation commands require a human gate.
- Production starts require the exact accepted workspace commit. Missing, dirty, unpushed, or mismatched commits stop before a real run.
- Shared row execution now owns spend caps, checkpoint behavior, per-row failures, honest terminal states, remaining keys, and final bookkeeping.

## Before 0.1.0: gtm-lib v9, 2026-08-27

- Preserved original provider responses for cache reparsing.
- Restored the local workflow runtime and made the paid-call ledger authoritative for run totals.

## Upgrade notes for older projects

| Installed library generation | User-visible reason to upgrade to generation 13 |
| --- | --- |
| v2 | No fixed workflow schema or committed migration path |
| v5 | No supported run cancellation |
| v6 | Web research evidence can be separated from the structured answer that needs it |
| v8 | Cached provider responses cannot be reparsed from the original payload, and run totals can diverge from the ledger |
| v9 | Read-only inspection, tool isolation, duplicate-run protection, context-aware caching, redaction, cost attribution, approval reuse, restart safety, and exact-commit starts are incomplete |
| v10 | No provider discovery, bounded operator polling, row and step ledger attribution, selective reruns, command-generated diagrams, or receipt summaries |
| v11 | `gtm check` rejects valid workflows that use template literals in a step before the exported function |
| v12 | `gtm check` rejects an accepted drop migration forever, so a project with a deleted table cannot pass its own check |
