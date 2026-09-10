# Hosting agent capabilities

Use this reference when a request concerns the hosting agent itself. Apply the [shared interaction standard](../../gtm-workspace/references/interaction.md) to answers and proposals; the API names and paths below are authoring references.

## Version and execution boundary

Verified 2026-09-10 against the Eve documentation and `eve@0.52.5` package declarations. Eve is in public beta. This is a reference baseline, not a declaration that the host runs that version. Read the host's `package.json` pin and, for a range, its lockfile before promising a capability.

An Eve agent is a directory of files under `agent/` compiled into an application. A session is a durable conversation; each turn runs as a Workflow run and can park while waiting for approval, authorization, or input. The agent loop, authored tools, and connection clients run in the app runtime. The sandbox handles filesystem access and code execution, with a lifetime separate from the parked turn. See [execution and durability](https://eve.dev/docs/concepts/execution-model-and-durability).

The workflow project and its hosting agent have separate tools, credentials, sandboxes, and memory. An Eve workflow tool belongs to the host application; it does not give a deployed GTM workflow access to the host's resources.

## Primitives and change authority

Use only capabilities exposed in the current session. A source change requires the host's declared editing path and approval. In the table, **source change** means an external coding session unless the host explicitly permits that file through its source editor. A permitted source editor proposes a draft pull request; it does not make arbitrary self-edits live. Instructions and schedules are common permitted files, not a universal allowlist.

| Building block | File convention and purpose | Can the hosted agent change it itself? |
| --- | --- | --- |
| Agent config | `defineAgent` in `agent/agent.ts` selects model and runtime limits. [Config](https://eve.dev/docs/agent-config) | Source change. |
| Instructions | `agent/instructions.md` sets behavior, tone, and priorities. [Instructions](https://eve.dev/docs/instructions) | Propose through the source editor only if this file is allowed. |
| Tools | `defineTool` in `agent/tools/*.ts` defines typed actions; `always()`, `once()`, and `never()` set approval policy. [Tools](https://eve.dev/docs/tools) | Invoke exposed tools within their authority; definitions and approval policy need a source change. |
| Workflow tools | `defineWorkflowTool` in `agent/tools/*.ts` creates durable tool runs; `ctx.ask` waits for human input and `ctx.agent` delegates to a visible subagent. [Workflow tools](https://eve.dev/docs/tools/workflows) | Source change; follow the host's interaction rules when invoking one. |
| Built-in tools | Framework defaults occupy `agent/tools/<name>.ts`; authored replacements or `disableTool()` control them. Sandbox bash and file access depend on host policy. [Built-ins](https://eve.dev/docs/concepts/built-in-tools) | Use the exposed set; enabling, replacing, or disabling tools needs a source change. |
| Skills | `agent/skills/<name>/SKILL.md` supplies procedures and referenced material. [Skills](https://eve.dev/docs/skills) | Read installed skills; permanent installation or changes need a source change. |
| Subagents and remote agents | `agent/subagents/<name>/agent.ts` defines a local specialist; `defineRemoteAgent` in `agent/subagents/<name>.ts` targets another deployment. [Subagents](https://eve.dev/docs/subagents), [remote agents](https://eve.dev/docs/guides/remote-agents) | Delegate only through exposed tools; adding specialists or remote targets needs a source change. |
| Sessions and turns | Runtime records, not authored files; channels start or resume durable conversations and their turns. [Execution](https://eve.dev/docs/concepts/execution-model-and-durability) | Continue through exposed session controls; do not edit runtime records as source. |
| Durable state | `defineState` from `eve/context`, declared in a shared module such as `agent/lib/state.ts`, persists typed values within one session. [State](https://eve.dev/docs/concepts/state) | Existing tools may update their slots; adding state access needs a source change. This is not cross-thread memory. |
| Memory | `defineMemory` in `agent/memory.ts` or `agent/memory/<slot>.ts` binds a scoped provider for recall, capture, and optional tools across sessions. [Memory](https://eve.dev/docs/memory) | Use an installed provider's tools if exposed; adding a provider or changing scope needs a source change. |
| Sandbox | `defineSandbox` in `agent/sandbox.ts` or `agent/sandbox/sandbox.ts` configures execution, setup, and network access. [Sandbox](https://eve.dev/docs/sandbox) | Execute within declared permissions; backend, network policy, and credentials need a source change. |
| Channels | `agent/channels/*.ts` uses `defineChannel` or a supported adapter for Slack and other message systems. [Channels](https://eve.dev/docs/channels/overview) | Use configured destinations within authority; new channels, DMs, or routing changes need a source change. |
| Connections | `agent/connections/*.ts` uses `defineMcpClientConnection` or `defineOpenAPIConnection`; Vercel Connect can manage authorization. [Connections](https://eve.dev/docs/connections) | Use configured tools and supported sign-in; adding a system or changing its tool scope needs a source change. |
| Schedules | `defineSchedule` in `agent/schedules/*.ts`, or Markdown schedules, compiles to Vercel Cron on Vercel and starts agent work. [Schedules](https://eve.dev/docs/schedules) | Propose through the source editor only if schedules are allowed; confirm timing and destination before activation. |
| Hooks | `defineHook` from `eve/hooks` in `agent/hooks/*.ts` observes recorded runtime events for logging or other side effects; it cannot inject model context. [Hooks](https://eve.dev/docs/guides/hooks) | Source change. Eve `defineHook` is distinct from Workflow `defineHook`, which defines resumable waits. |
| Dynamic capabilities | `defineDynamic` in the relevant config or capability file resolves available capabilities at session or turn boundaries. [Dynamic capabilities](https://eve.dev/docs/guides/dynamic-capabilities) | Existing resolvers run automatically; their policy and available set need a source change. |
| Extensions | Mount under `agent/extensions/`; `defineExtension` in `extension/extension.ts` packages capabilities, including browser or GitHub integrations. [Extensions](https://eve.dev/docs/extensions) | Use installed capabilities; installing or configuring an extension needs a source change. |
| Evals | App-root `evals/*.eval.ts` and `evals/evals.config.ts` exercise agent sessions and assertions. [Evals](https://eve.dev/docs/evals) | Source change for tests; execution depends on host controls and accepted cost. |
| Observability | Agent Runs in Vercel Observability shows agent sessions, turns, tools, and usage; `agent/instrumentation.ts` customizes tracing. [Agent Runs](https://vercel.com/docs/eve/observability) | Read only through available dashboard or host access; instrumentation needs a source change. |
| CLI | The pinned Eve CLI builds, develops, inspects, evaluates, and deploys the agent project. [CLI](https://eve.dev/docs/reference/cli) | Only commands allowed by the host; CLI availability grants no source-edit or deployment authority. |

## Route the request

| User request | Response and route |
| --- | --- |
| Remind me every Monday, or send a recurring digest | Use a native Eve schedule. If the host allows schedule edits, propose through its source editor as a draft PR. A schedule that produces workflow data belongs in a workflow cron instead. |
| Change your tone or priorities | Propose an instructions edit through the host's allowed source-edit path. |
| Connect Linear or another system to yourself | Add an Eve connection in agent source through an external coding session unless the host explicitly allows this change. Signing into an existing connection is a separate operation. |
| Run for every booking, nightly, or over many rows | Author a GTM workflow with signed event intake, cron, or `runRows()` per [workflow shapes](capabilities.md#workflow-shapes). |
| Remember this across threads | Check for an installed Eve memory provider. Adding one is an agent-source change; until then, use the connected workspace repository for accepted durable business facts through its normal save gate. Do not promise automatic cross-thread recall. |
| Post elsewhere or reply in DMs | Check configured channels and destinations. A new channel or routing behavior is a source change; use the external coding path unless the host allows it. |
| Let the workflow use your search or MCPs | It cannot inherit them. Author workflow-owned tools and supply their own credentials per [composition](capabilities.md#tools-and-committed-skills). |
| Browse a site | Use the agent's installed Eve browser extension if exposed. A deployed workflow needs its own browser adapter and session cleanup. |
| Approve steps automatically | Distinguish Eve tool approval policy from workflow standing authorization. Changing Eve approvals is a source change; unattended workflow effects require accepted [event-source scope](events.md), quotas, and destinations. |
| Read your own run history | Use Agent Runs in Vercel Observability if accessible. The workflow project's Workflows tab is a separate run history. |

## Honesty and sources

When an answer depends on Eve behavior, state the host's pinned Eve version and check the relevant eve.dev page against that version's bundled documentation or package declarations. This version detail is necessary when it changes whether the request is possible. If the host pin is unavailable, say that compatibility is unverified. Current website documentation can describe a newer release; do not turn that into a promise or silently upgrade the host.

The linked pages define primitives; the host's `package.json`, lockfile, installed definitions, and standing instructions decide what is available and editable. [Vercel's Eve overview](https://vercel.com/docs/eve) establishes beta status and the runtime services. Keep the hosting agent and workflow project separate in every answer, including tools, credentials, sandbox, and memory.
