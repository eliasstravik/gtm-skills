### Local

Describe this target to the user as `Local` or `runs on this computer`. It runs on demand, saves results locally, and changes no connected app unless the workflow explicitly includes that write. Keep the implementation details below in the registry and reveal them when the user asks for developer details.

Author and update tracked TypeScript scripts, schemas, tests, and fixtures inside `workflows/<workflow-slug>/`. As workflows accumulate, graduate repeated provider calls into one small typed `workflows/lib/<connection>.ts` wrapper per connection and import it from workflow scripts. Validate with the accepted project-local commands. Inspect every tracked implementation file and the actual diff internally before showing the behavior and affected-path proposal.

Run once or pilot from the local script entry point. The script owns the loop. Rows, provider calls, retries, and intermediate data stay inside code and SQLite, while only business summaries and requested results enter the agent conversation. Never iterate workflow rows through agent context.

Keep lightweight run observability in SQLite. A `runs` table records `run_id`, `started_at`, `finished_at`, `scope`, and `outcome`, while processed rows carry `status`, `error`, and `provider`. Inspection uses those fields but reports completed and failed items, failure causes, and providers before diagnostic identifiers. Workflows that need step timelines, retry traces, or live dashboards belong on an infrastructure target with native observability such as Vercel Workflows' `npx workflow web` and dashboard or Inngest's local dev server UI.

This target supports on-demand workflows only. For cadence, use an infrastructure or app target, or keep `Kind: on-demand` and let the user's scheduler invoke it. For recurring sweeps, keep a per-row due-state column such as `next_action_date` in SQLite so each invocation processes only due rows.

There is no separate publish step. Accepted, validated tracked code is live for local invocation. Inspect behavior through source, tests, and gitignored local run files. To open saved data, serve the existing `state.sqlite` read-only with Datasette by default and hand over `Open saved results: <local link>`. Use `sqlite-web` when row editing is requested; DB Browser for SQLite and TablePlus are desktop alternatives. Keep product name, immutable mode, port, raw path, and stop command under developer details. When a private sharing capability is available and accepted, hand over the private link, state who can access it, and offer to stop sharing later. Never build a custom viewer.

For `show me the workflow`, regenerate a Mermaid business-process diagram with four to eight primary nodes and a short caption. Use operator language for the trigger, business steps, result, and saved output. Show a branch only for a user choice or materially different business outcome. Hide retries, schemas, SQLite writes, model settings, process state, telemetry, and implementation loops. Add one short note explaining how partial failures appear. Generate a technical control-flow diagram only when the user explicitly asks for implementation detail. Retaining a diagram in `WORKFLOW.md` requires the normal acceptance gate.

The implementation and record live in the workspace. SQLite state uses `state.sqlite`; run data belongs under `runs/` or `outputs/`; caches belong under `.cache/`. All are covered by the workflow-owned `.gitignore` lines and never enter history.

Connections use environment-variable, keychain, or 1Password pointers only. Record provider billing and estimate cost before any material provider call; a small local pilot is the default consequential-run option.
