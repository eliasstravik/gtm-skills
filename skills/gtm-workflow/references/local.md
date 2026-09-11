# Local use

`gtm run` starts the Nitro server on a free port when no configured server answers, records it in ignored `.gtm-local.json`, and prints `Started the local server.`

Open `/_workflow` for traces and run `npm run db:studio` for Data. Set `GTM_BASE_URL` only when choosing an already-running origin.

A paused local run waits only while the local server is up.

Local short `agent()` calls select the exact CLI named by `GTM_HOST`. The v1.0 capability spike found:

| CLI | Budget | Turns | Tool restriction | HTTP MCP headers | `agentStage()` without Gateway |
| --- | --- | --- | --- | --- | --- |
| Claude Code 2.1.268 | `--max-budget-usd` | unavailable | `--tools`, `--allowedTools`, `--disallowedTools`; built-ins disabled with `--tools ""` | `${ENV}` expansion | refused: no turn cap |
| Codex 0.154.0 | unavailable | unavailable | `--sandbox read-only` and MCP config; reads remain available | bearer env/header mapping | refused: no budget/turn cap and cannot disable reads |
