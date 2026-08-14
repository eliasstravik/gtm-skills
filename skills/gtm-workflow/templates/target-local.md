### Local TypeScript + SQLite

Author and update tracked TypeScript scripts, schemas, tests, and fixtures inside `workflows/<workflow-slug>/`. As workflows accumulate, graduate repeated provider calls into one small typed `workflows/lib/<connection>.ts` wrapper per connection and import it from workflow scripts; these wrappers are authored, tracked code. Validate with the accepted project-local commands and include every tracked implementation byte with the record acceptance preview.

Run once or pilot from the local script entry point. The script owns the loop: rows, provider calls, retries, and intermediate data stay inside code and SQLite, while only summaries and results surface to the agent conversation. Never iterate workflow rows through agent context.

Keep lightweight run observability in SQLite: a `runs` table records `run_id`, `started_at`, `finished_at`, `scope`, and `outcome`, while processed rows carry `status`, `error`, and `provider`. Inspect summarizes these fields by outcome, failure cause, and provider. Step timelines, retry traces, and live dashboards are outside this target; workflows needing them belong on an infrastructure target with native observability such as Vercel Workflows' `npx workflow web` and dashboard or Inngest's local dev server UI.

This target supports on-demand workflows only. For cadence, either use an infrastructure or app target, or keep `Kind: on-demand` and let the user's agent-harness scheduler—such as Claude Code routines or cron, or Paperclip routines—invoke it. Scheduling stays outside the workflow. For recurring sweeps, keep a per-row due-state column such as `next_action_date` in SQLite so each invocation processes only due rows.

There is no separate publish step: accepted, validated tracked code is live for local invocation. Inspect behavior through source, tests, and gitignored local run files. When the user wants to see, filter, facet, or query workflow data, serve the existing `state.sqlite` with read-only Datasette by default (`uvx datasette <path>/state.sqlite`) and hand over its localhost URL. Use `sqlite-web` when row editing is wanted; DB Browser for SQLite and TablePlus are desktop alternatives. Never build a custom viewer.

For “show me the workflow,” regenerate a Mermaid flowchart of the script's stages on demand, matching the `clay workflows diagram` idiom. Show it directly or, when the user wants to retain it, acceptance-gate an update to `WORKFLOW.md`. Do not build an interactive local node editor; route that requirement to target choice, where Clay or n8n is one `Target:` change away.

The implementation and record live in the workspace. SQLite state uses `state.sqlite`; run data belongs under `runs/` or `outputs/`; caches belong under `.cache/`. All are covered by the workflow-owned `.gitignore` lines and never enter history.

Connections use environment-variable, keychain, or 1Password pointers only. Record provider billing and estimate cost before any material provider call; a small local pilot is the default consequential-run option.
