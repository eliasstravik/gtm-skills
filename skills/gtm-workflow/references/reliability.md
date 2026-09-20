# Runtime upgrades and failure diagnostics

## Upgrade startup commands

After copying template-owned runtime files, run `node <skill>/scripts/upgrade-package.mjs /path/to/workflows` to preview the package merge, then add `--write` to apply it. It updates template dependencies and recognized stock startup commands, adds missing commands, and preserves user-added dependencies and customized scripts. Review each name in `review` and incorporate required build/migration steps into that command while preserving its custom behavior. Keep custom ports and explicit timeout overrides. Previous runtimes containing `scripts/gtm.ts` need a separate migration.

Copy template-owned files by path. Preserve extra user-authored files in those directories. Keep workflows, data, environment files, schedules, and custom tables intact. Install dependencies after the merge as the Upgrade procedure specifies.

`npm run dev` is the supported local launch path because it also starts the local database, builds the viewer and runs migrations. Direct `nitro dev` reads the same timeout defaults through `nitro.config.ts` and `lib/local-runtime.ts`, but skips those preparatory commands. Both local queue timeouts default to 900,000 ms. Explicit environment values, including `0`, remain overrides. Restart the existing server after an upgrade; a running queue retains the options it had when created. Verify the actual launch command and a diagram page after restart. Hosted deployments use the hosted queue and require deployment verification instead.

## Diagnose the failing boundary

The `[gtm-workflow]` diagnostic records contain bounded identifiers and error names/codes, never raw request bodies, auth headers, CLI output, or nested error messages. Row/run errors preserve these diagnostics across Workflow serialization. Generic step errors retain names/codes rather than arbitrary provider payloads.

| Layer | Meaning |
| --- | --- |
| `local_queue_transport` | A local queue HTTP request failed. Undici diagnostics retain the nested code and queue message ID when available. The SDK may also emit its shorter retry log. |
| `mcp_transport` | Connecting to, requesting from, or closing an MCP server failed. |
| `mcp_tool` | The server returned `isError`; transport completed. The existing tool result remains available to the agent. |
| `cli_launch`, `cli_exit`, `cli_timeout`, `cli_result` | The process could not start, exited unsuccessfully, exceeded its deadline, or returned an error/invalid result. |
| `provider_transport`, `provider_response` | A gateway request failed, or its HTTP/JSON/job response reported failure. `provider` names the gateway contacted; `operation` identifies the requested provider/endpoint when known. |
| `step` | A workflow step or local persistence operation failed. |

Queue timeout settings do not fix provider or CLI failures. A gateway failure does not establish which upstream hop failed. Correlate run/request IDs with the gateway's evidence before attributing it. The alternate SDK `WORKFLOW_NODE_HTTP` transport does not emit Undici events; its SDK log remains the source for queue errors. No paid-call retries are added, and uncertain provider dispatches stay reserved to prevent duplicate charges.
