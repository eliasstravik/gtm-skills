# Workflow composition

This is the GTM library's selection and execution contract. Use it when creating, changing, explaining, or operating a workflow, including requests phrased as `/gtm-workflows`. The installed skill remains `gtm-workflow`.

## Contents

- [Choose the execution shape](#choose-the-execution-shape)
- [Workflow shapes](#workflow-shapes)
- [Available building blocks](#available-building-blocks)
- [Durable agent stages](#durable-agent-stages)
- [Tools and committed skills](#tools-and-committed-skills)
- [Limits and accounting](#limits-and-accounting)
- [Authoring and operations](#authoring-and-operations)
- [Extension boundary](#extension-boundary)

## Choose the execution shape

GTM's default is explicit business stages. Choose the mechanism per stage, without asking the user to select an SDK class.

| Requested behavior | GTM choice |
| --- | --- |
| Website, known enrichment endpoint, score, conditional notification | Named steps, `provider()`, short `agent({ tools: "none" })` only if scoring needs model judgment, then an explicit delivery step |
| Research a lead using selected skills, MCPs and web tools, deciding what to investigate next | `durableAgent()` in workflow context, backed by `WorkflowAgent`; persist the validated brief, then deliver it |
| A fixed pipeline with one open-ended stage | Ordinary steps surrounding a durable agent; agent output is typed input to the next stage |
| Email, wait three days, check for a reply, then follow up | Use shape 3, one long-lived run per entity, with durable delays and a reply callback |
| Short extraction, classification, or generation | Existing `agent()` inside a named step; no agent loop is needed |
| A bounded tool loop that can finish within one step and whose whole-attempt replay is acceptable | A workflow-owned `ToolLoopAgent` adapter inside a named step, with per-call accounting and zero automatic paid retries; prefer the managed durable stage when calls have independent effects |
| A coding/terminal agent using an existing harness | Follow the harness compatibility and execution-environment branch below; a chat/tool loop does not provide a filesystem or shell |

The Cal.com and Monid examples name capabilities, not workflow templates that every request must copy. A model choosing the next tool is what earns an agent stage. A known API call remains an ordinary step even if the API is also available through MCP.

## Workflow shapes

Choose one of these recipes before authoring. Read the pinned `workflow/docs/` branch for the selected primitives, especially `foundations/workflows-and-steps.mdx`, `foundations/hooks.mdx`, and `api-reference/workflow/sleep.mdx`; keep SDK examples there. Each recipe still follows the run and save gates in [flows](flows.md).

1. **Batch rows.** Start through the managed route with explicit input or selected rows from a previous run. Use `runRows()` for saving, caps, and terminal state; it defaults to one row at a time and accepts `concurrency` from 1 to 16. Declare the same `Concurrency: N` in the workflow header. Put optional delivery in `afterSave`, after each save and before the checkpoint. Request the first review after three rows; parallel work rounds that count up to the batch boundary and the proposal states the actual count. The diagram shows the loop width, named stages, delivery, and checkpoint. `gtm check` enforces static concurrency, matching header, zero retries on a named row step, row identity, table fields, labels, and bookkeeping.
2. **Scheduled scan.** Export `scheduledInput` and align the schedule header with the cron entry that calls the managed start route. Use `runRows()` for scan rows and `afterSave` for delivery. Deduplicate starts and delivery by `scheduled_for`; opt into `cadence-minutes` for subdaily admission windows per [event sources](events.md). Scheduled runs have no interactive row checkpoint; configure standing authorization before unattended effects and use a bounded explicit approval only when the scan must pause. The diagram shows the scheduled start and scan loop, plus any explicit waits. `gtm check` enforces input, caps, visible stages, and bookkeeping; verify cron alignment and delivery deduplication separately.
3. **One long-lived run per entity.** Let signed event intake start one run per booking, contact, or other entity. Use ordinary named steps, `sleep()` in workflow context for delays measured in days, and `waitForTrigger()` for a reply or callback to that run. Put any `approve()` before its protected effect and finish success/failure paths with terminal `updateRun()`. A multi-day wait belongs in this per-entity run, never inside a `runRows()` row step, where it would block the remaining rows. The diagram shows the event start, business steps, delay, callback wait, and decisions. `gtm check` enforces deterministic orchestration, labels, paid-step retries, and terminal bookkeeping; review wait duration and callback wiring separately.
4. **Fixed pipeline with one open-ended stage.** Start from explicit input or signed event intake. Surround `durableAgent()` in workflow context with ordinary steps and validate its typed output before passing it to the next step. Export `AGENTS`; pass the preview's capability hash through the trusted start control. Put approvals before protected effects and waits between stages; use a row checkpoint only when composing with `runRows()`. The diagram shows one dynamic agent node between fixed stages; native traces show its tool calls. `gtm check` enforces `AGENTS`, the agent boundary outside steps, labels, and bookkeeping. The dry run and trusted start control validate capabilities and reject a changed preview hash.
5. **Large input through child batches.** Start one accepted input through the managed route. After parsing it, the parent workflow returns `runBatches()` from workflow context. Declare `childWorkflow`, `batchSize` (1–300), `timeoutMs`, result `table`, and caps as literals or committed constants. Each child uses `runRows()` and the same result table; children run one batch at a time, with the remaining parent budget. Review a small input first: parent runs do not accept row checkpoints. The diagram has a batch card with the child's graph collapsed beneath it and per-batch status for a run. `gtm check` enforces the parent boundary, child export and row helper, and matching result tables. See [contract](contract.md#runtime-and-run-identity) for propagation and platform limits.

## Available building blocks

| Building block | Authoring support and GTM requirements |
| --- | --- |
| `"use workflow"`, `"use step"` | Native orchestration and isolated work. Keep named business stages, input validation, and terminal bookkeeping. |
| `if`, loops, `try/catch/finally`, `Promise.all`, `Promise.allSettled` | Native composition. Bound concurrency. `runRows({ concurrency })` settles each batch independently; parallel paid branches share the run's reservation ledger. |
| `WorkflowAgent` | Managed through `durableAgent()`. Model steps and tool executions persist separately in the Workflow event log. |
| `ToolLoopAgent`, `generateText`, `streamText`, structured output | AI SDK APIs, not additional Workflow engines. Use the short managed helper or an accounted adapter as appropriate. |
| `sleep()` | Native durable delay. The diagram shows a wait. Use it for polling intervals, delayed follow-up, and deadlines. |
| `defineHook`, `createHook`, `createWebhook` | Native resumable waits. Existing `approve`, `checkpoint`, and `waitForTrigger` cover managed human decisions and callbacks. A callback resumes a run; event intake starts one. |
| HTTP, cron, webhook, queue consumer | Starts are adapters around `start()`. Use the protected managed start route or signed event intake. A queue needs its own receipt/ack adapter. |
| Child workflows, subagents | Use `runBatches()` for one parent with ordinary row-workflow children. It owns starts, completion hooks, remaining budget, aggregation, cancellation, and deadline propagation. Other native child patterns need their own explicit propagation contract. |
| `getWritable`, readable streams, `WorkflowChatTransport` | Native streaming. Keep business rows authoritative. A transport for a chat UI does not create Slack delivery; add a bounded trusted consumer only when requested. |
| `getWorkflowMetadata`, `getStepMetadata`, `setAttributes` | Native trace identity and attributes. Keep secrets out. Static diagrams show a dynamic agent boundary, not its future tool sequence. |
| `FatalError`, `RetryableError`, retry settings | Throw `FatalError` for a permanent error in an unpaid step that otherwise keeps default retries; this stops that failure without disabling retries for every error through `maxRetries = 0`. Paid/effectful operations still use zero automatic retries unless provider evidence proves retry safety. |
| `start`, `getRun`, resume APIs, cancellation | Native lifecycle controls. Use the host tool for production operations; the authoring sandbox remains read-only with respect to execution. |
| HTTP APIs, MCP, search, fetch, browser, files/media, remote compute | Tools/adapters inside steps. Select only the needed services, accepted endpoints and credentials. Browser and code sessions require explicit creation, expiration, and cleanup. |
| Database results, cache, migrations | Existing GTM Turso/SQLite contract. A workflow writes its own outputs, not canonical ICP/persona/company facts. |
| HarnessAgent and workflow-harness | Recognized extension, with the compatibility check below. Not an installed default or a synonym for WorkflowAgent. |
| Code-mode tools and sandbox tools | Optional execution adapters. Pin compatible packages and account each inner paid/effectful operation; an outer tool wrapper alone is insufficient. |

Read the installed `workflow/docs/` branch for the selected native building block. Keep SDK examples out of the skill body; the project's additional rules are here.

## Durable agent stages

Export `AGENTS` as an array of serializable `AgentDefinition` values from the workflow. Pass an entry to `durableAgent(AGENTS[0], input, meta, { signal })` from workflow context, including a plain `rowStep` helper. Never put the whole loop inside `"use step"`.

The definition names its stable stage `id`, business `label`, source `revision`, model, instructions, JSON output schema, selected tools, selected skills, model/tool call limits, token limit, run spending limit, and deadline. `templates/lib/capabilities.ts` owns the exact schema. Revise the source identity when instructions, schemas, models, tools, or skills change. `gtm run --dry-run` validates and describes the definitions without making any model or connector request.

Parse the returned value with the business Zod schema before saving. Save the result before a notification. A stopped loop without a complete structured result is a failure, not a partial brief presented as complete.

Use `runRows()` for row isolation and cancellation, passing its signal to the stage. Put notifications that follow persistence in its `afterSave(row, meta, signal)` callback. It runs in workflow context before checkpoints and terminal bookkeeping; a delivery failure marks that row and the run failed. A completed run cannot admit another paid or effectful step. Claim delivery atomically in the business table when the same business event could arrive under different run IDs; a run-local ledger alone cannot prevent those duplicate sends. For a single-input workflow, explicitly register the run and update terminal state in success/failure paths. A managed agent is one business node in the diagram; native traces contain its model/tool calls.

## Tools and committed skills

`ToolDefinition` supports fixed HTTP GET/POST endpoints and remote Streamable HTTP MCP tools. Schemas and descriptions are committed. Discover/inspect a server at author time and copy the selected tool contract; do not load every tool or promote server instructions into agent instructions at runtime.

Keep Node-only authentication and provider SDK imports inside the trusted step or a lazily loaded step implementation. A shared module that exports a workflow-visible schema must remain safe to initialize in the workflow VM. Build success alone is insufficient; the build must also pass the compiled workflow initialization check.

Credentials are environment-variable references. Resolve values inside trusted workflow steps. Eve connections, Eve skills, Eve's browser, and Eve's sandbox are separate resources and are not inherited by deployed workflows.

Bind authority-bearing arguments in `fixedArguments` or constrain them with JSON Schema `const`/`enum`, including integration/action identifiers and delivery destinations. An allowlisted dispatcher such as `monid_run` still needs its inner operation constrained. A search result may suggest evidence to fetch, never a new authorized operation or destination. Responses must satisfy the committed output schema and size limit. For dispatchers, bind each provider/endpoint pair in a separate tool and constrain nested arguments to the inspected contract, including minimum result counts and paid fan-out options.

For a read-only MCP tool, `recoverableErrorSchema` can match an expected no-result response, such as Hunter's completed `not_found` lookup. The schema validates `structuredContent`, or the parsed JSON of a single text block when structured content is absent. Matching results keep the MCP envelope, including `isError`, and reach the model without retrying; their ledger attempts remain errors with the cost reservation retained. Instruct the agent to continue with other accepted sources and report missing identity evidence. Scope recovery to the documented provider, operation, terminal status, and error code. If a server hides no-match details behind an opaque error, an optional read tool may match that exact response only when an unavailable lookup is an accepted outcome. Limit it to one call, record it as unavailable rather than confirmed no-match, and use other accepted sources. Never broadly accept arbitrary errors, authentication failures, quota failures, or uncertain writes. Unmatched failures stop the stage and retain bounded, redacted diagnostics in its ledger.

Search and page retrieval are separate tools. Add a browser MCP or a workflow-owned browser adapter only for pages requiring interaction. For sessions, commit setup and `finally` cleanup steps with expiration and cancellation behavior. Do not place a session-creation endpoint in the agent's toolbox without a cleanup owner. Browserbase, Monid, and other services keep their exact request contracts in provider adapters and fixtures.

Selected skills contain `name`, `description`, `revision`, and committed `content`. The agent sees metadata and requests content through `loadSkill`. Copy the medium-neutral method and referenced resources into the reviewed definition at author time. Do not copy lifecycle wrappers that ask the production agent to edit a workspace or request deployment approval. Skill content grants no tools. Scripts require a separate explicitly scoped execution adapter; text loading does not execute them.

## Limits and accounting

The managed agent records each model and remote tool attempt in `enrichment_runs`. Its model/tool step results are replayed from the Workflow event log, not the cross-run enrichment cache. A deliberate new run can spend again. Classic enrichments continue using `provider()` and its TTL cache.

Admission is one atomic database statement. It checks run cancellation, run-wide reserved/reported spend, the stage's per-tool count, and total remote tool count. Concurrent tool calls cannot each consume the same remaining allowance. Use the same `maxSpendUsd` for all stages sharing a run. `runRows` supplies its concurrency and cap in row metadata; `provider()` automatically reserves parallel cache misses. For other parallel classic calls, pass `provider({ admission: { operation, maxSpendUsd, maxCalls }, ... })`. For a custom adapter that directly owns its effect, use `reserveAgentCall`/`settleAgentCall` inside the named step. Every parallel paid branch must participate, and each attempt has one accounting owner.

Set `costKind: "upper-bound"` only with provider evidence that the configured request cannot exceed it. Otherwise use `estimate`; preview labels the uncertainty. Gateway reported model cost replaces the reservation when available. Remote tool cost remains its declared fixed/projected amount unless an authored adapter reconciles reported usage. Call and token limits still apply, but an estimated dollar limit is not a guaranteed invoice ceiling.

When no price can be estimated, resolve a provider-side credit limit or scoped quote before enabling unattended work. Zero means free, not unknown.

Ambiguous attempts retain their reservation. Automatic model, MCP, and paid-step retries are disabled. The ledger prevents the same operation from being blindly admitted again; provider idempotency is still required for retrying external writes. Inspect an uncertain Slack send before repeating it. A successful HTTP response alone does not prove a service-level success; the adapter output schema must reject application errors.

## Authoring and operations

During create/update, choose the shape, resolve capabilities, package skills, and inspect integration contracts before presenting the save proposal. State tools, destinations, effects, model/tool limits, timeouts, and whether costs are estimates. Resolve only missing business choices with the user; package selection is the author's work.

For a real agent run, pass the dry run's `capabilitiesHash` to the host start tool as `expectedCapabilitiesHash`, alongside its rows and projected cost. The host reruns the preview and refuses changed capabilities. The hash covers the full definition, including skill content and fixed arguments.

Inspect agent runs using their stage attributes and per-call ledger. Preserve native runtime errors and failed stage evidence for operator inspection. Use existing row selection (`--rows-from-run`, `--only`) to prepare a reviewed rerun input, then preview and start through trusted host controls. A rerun needs authorization for its new effects.

For intake creation, updates, enable/disable, quotas, duplicate events and uncertain starts, read [event sources](events.md). For retirement, disable sources and schedules before removing a definition that active runs still need.

## Extension boundary

General Node steps remain available for capabilities that do not fit the managed helper. An extension must provide a named owner, typed input/output, accepted effect/destination scope, credential boundary, timeout/cleanup, accounting, retry/replay behavior, fixtures, and a representative build. Keep it under workflow-owned adapters, not edits to managed `lib/` files.

Verified 2026-09-09: `@ai-sdk/workflow@2.0.27` accepts `workflow@^5.0.0-beta.42` and depends on `ai@7.0.96`. This release pins those compatible APIs with the existing beta.46 runtime. `@ai-sdk/workflow-harness@1.0.106` declares `workflow@^4.2.1`; do not force-install it into this v5 project. Recheck its peer range when a harness is requested, then use a compatible release or propose the required runtime upgrade with fixture evidence. The helpers are `createHarnessWorkflowState`, `runHarnessAgentStep`/`runHarnessAgentTimeSlice`, and `finalizeHarnessWorkflow`; there is no `WorkflowHarnessAgent` class.

A harness or code-execution workflow needs its own trusted remote execution environment. The Eve authoring sandbox retains its deny-all policy, no model key, and no exposed port. Do not reuse it for production execution or copy public examples that expose a port without a requirement.

Native Python workflows, region routing, retention settings, and other platform deployment options are not a second GTM project format. Discuss the required project/runtime change when requested; this library ships a TypeScript/Nitro project.

Sources for API verification: [WorkflowAgent](https://ai-sdk.dev/v7/docs/agents/workflow-agent), [MCP](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools), [agent skills](https://ai-sdk.dev/cookbook/guides/agent-skills), [workflow-harness](https://github.com/vercel/ai/tree/main/packages/workflow-harness), and the pinned Workflow package's bundled documentation. These establish API behavior; the GTM choices and limits above govern authored projects.
