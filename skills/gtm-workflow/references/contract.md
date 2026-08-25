# GTM workflow contract

Use this contract for every workflow action.

## Contents

- [Workspace resolution and ownership](#workspace-resolution-and-ownership)
- [Project shape](#project-shape)
- [Workflow file contract](#workflow-file-contract)
- [Runtime semantics](#runtime-semantics)
- [House rules](#house-rules)
- [Run limits](#run-limits)
- [Results and connections](#results-and-connections)
- [Deployment state](#deployment-state)
- [Safety and persistence](#safety-and-persistence)

## Workspace resolution and ownership

Resolve the workspace in this order: a repo named in the request, the repo the environment declares connected, then canonical repos under `~/.gtm/` where root `ORG.md` makes a repo valid. If several remain, ask `**Which GTM workspace should I use?**`, list display name and path, and save no preference. If none exists, stop without writing and hand creation or connection to `gtm-workspace`.

A request-named organization node wins. Otherwise use root unless the workflow belongs to exactly one other node. For create, when suborganizations exist and none was named, ask `**Which organization should own this workflow?**`, with root first as `(Recommended)` and every nested node by display name.

The project always belongs at workspace root. A root workflow is `flows/<slug>.ts`. A suborganization workflow is `flows/<suborg-path>/<slug>.ts`, with physical `suborgs/` segments omitted. Its header names the owner and ICP.

Before acting, state `Using GTM workspace: <display name> | <N> workflows visible`, using `workflow visible` for one. Put this status below the opening bold question when the message asks a question.

## Project shape

```text
workflows/
├── .env.example
├── .env
├── package.json
├── package-lock.json
├── nitro.config.ts
├── vercel.json
├── flows/<owner-path>/<slug>.ts
├── lib/agent.ts
├── server/api/run/[...workflow].ts
├── server/api/runs/[runId].get.ts
└── data/
```

Track the scaffold, workflow files, schedule configuration, `.env.example`, lockfile, and deployment metadata. Ignore `node_modules/`, `.env*` except `.env.example`, `.vercel/`, `.well-known/`, `.workflow-data/`, `.nitro/`, `.output/`, `.swc/`, and `data/`. Only the root node may contain `workflows/`.

## Workflow file contract

Use a lowercase kebab-case filename and export its camelCase basename. The leading header has five lines for on-demand and triggered workflows, and six for scheduled workflows:

```ts
/**
 * <One sentence stating the workflow's purpose.>
 * Runs: on this computer | on Vercel
 * Kind: on-demand | scheduled | triggered
 * Schedule: <UTC cron expression>              // scheduled only
 * Owner: <organization node> | ICP: <ICP name>
 * Providers: <provider + pinned endpoint + cost per row, or none>
 */
```

Export `input`, `MAX_ROWS`, `MAX_SPEND_USD`, `COST_PER_ROW_USD`, the camelCase workflow function, and `scheduledInput` for a scheduled workflow. Use this skeleton with the pinned template version:

```ts
import { z } from "zod";
import { agent } from "../lib/agent";

export const input = z.object({ accounts: z.array(z.string()) });
type Input = z.infer<typeof input>;
const accountScore = z.object({ account: z.string(), score: z.number() });

export const MAX_ROWS = 100;
export const MAX_SPEND_USD = 10;
export const COST_PER_ROW_USD = 0.1;

async function scoreAccountAgainstIcp(account: string) {
  "use step";
  try {
    const result = await agent({
      prompt: `Score ${account} against the ICP.`,
      schema: accountScore,
      tools: "none",
      maxUsd: COST_PER_ROW_USD,
    });
    return { ok: true, result } as const;
  } catch (error) {
    return { ok: false, row: account, error: String(error) } as const;
  }
}
scoreAccountAgainstIcp.maxRetries = 0;

export async function scoreAccounts(arg: Input) {
  "use workflow";
  const projectedSpend = arg.accounts.length * COST_PER_ROW_USD;
  if (arg.accounts.length > MAX_ROWS || projectedSpend > MAX_SPEND_USD) {
    throw new Error("Accepted workflow limits exceeded");
  }
  const completed: z.infer<typeof accountScore>[] = [];
  const failed: { row: string; error: string }[] = [];
  const hasAccountsToScore = arg.accounts.length > 0;
  if (hasAccountsToScore) {
    for (const row of arg.accounts) {
      const outcome = await scoreAccountAgainstIcp(row);
      if (outcome.ok) completed.push(outcome.result);
      else failed.push({ row: outcome.row, error: outcome.error });
    }
  }
  return { completed, failed };
}
```

For scheduled work, export `scheduledInput`, accept `arg: Input` with no default parameter, and put `arg ??= scheduledInput` directly after `"use workflow"`.

## Runtime semantics

The run route maps `/api/run/<path>/<kebab-name>` to `workflow//./flows/<path>/<kebab-name>//<camelCaseName>`. POST starts with an explicit body. GET starts without arguments for Vercel cron. The result route returns pending status or the completed workflow value. Both routes require the configured bearer.

`Runs: on this computer` uses local `nitro dev`. Scheduled and triggered work runs only when invoked. `Runs: on Vercel` requires a recorded deployment. Vercel cron is best effort and may double-fire. Hobby schedules run at most daily and may fire anywhere within the specified hour.

Use `./node_modules/.bin/workflow` for validate, inspect, and cancel. Nitro compiles workflows during `npm run dev` and `npm run build`. Pilots and full runs start through HTTP. Local UI: see [open](open.md).

## House rules

| Rule | Wrong | Right |
| --- | --- | --- |
| Business stages define the graph | Name steps `runAgent`, `processRow`, or `fetchData` | Use verb phrases such as `findCompetingStudios`, `scoreAccountAgainstIcp`, or `sendCompetitiveReport` |
| One step represents one stage | Add generic, technical, or decorative steps | Give each operator-named stage one function whose first statement is `"use step"` |
| The workflow reads as the process | Hide stage calls behind helpers | Call each stage directly from the workflow body |
| Loops expose row work | Call a helper that later invokes the row step | Call the row step directly inside the loop |
| Conditions carry business meaning | Branch on `rows.length > 0` inline | Name the condition, such as `hasAccountsToScore` |
| Helpers stay plain | Mark parsing or formatting helpers as steps | Reserve steps for business stages |
| Native names stay native | Patch aliases or rewrite the manifest | Accept camelCase in the UI and split the same names into spaced words in chat diagrams |
| Step data is serializable | Pass functions, classes, or schemas into a step | Pass and return plain data; supply the agent schema inside the step |
| Agent steps run once per row | Allow workflow retries on an agent step | Set `<stepName>.maxRetries = 0` after every step that calls `agent()` |
| Agent tools stay narrow | Enable research by default | Use `tools: "none"`, or `tools: "web"` when web evidence is required |
| Output fields stay present | Use `.optional()` for an omitted field | Use `.nullable()` because strict schemas require every property |
| Rows fail independently | Let one row exception escape | Catch the error inside the row step, return a success or failure result, and continue |
| Provider use is visible | Hide provider calls or costs in a wrapper | Put provider calls in named steps and pin provider, endpoint, and row cost in the header |
| Caps precede spend | Check after a provider or agent call | Reject row or projected-spend excess before the first spending step |
| Scheduled delivery deduplicates | Key delivery by time alone | Include `runId` and UTC date in each delivery payload |

## Run limits

Before a run, state the backend, model, row count, maximum turns, timeout, projected cost when monetary billing applies, and the limit each backend enforces.

| Backend | Enforced limits |
| --- | --- |
| `claude` | Workflow row caps and `timeoutMs` are hard bounds. `--max-turns` bounds turns. `--max-budget-usd` stops between turns after cumulative cost exceeds the value, so one turn can overshoot. |
| `codex`, `cursor`, `gemini`, `opencode` | Workflow row caps and `timeoutMs` are hard bounds. Their subscriptions enforce any provider limits. |
| `api` | Workflow row caps, `timeoutMs`, the Gateway key budget, and `stepCountIs(8)` for web search. |

For CLI backends, `MAX_SPEND_USD` and `COST_PER_ROW_USD` are projections. For `api`, they represent billed use. Pass `maxUsd: COST_PER_ROW_USD` to `agent()`; only `claude` consumes that argument.

Set `GTM_AGENT_MODEL` in ignored `.env` when a workflow pins a Claude CLI or API model, mirror the non-secret value in `.env.example`, and name the model in the workflow header.

## Results and connections

Return `{ completed, failed }`, fetch it through `GET /api/runs/<runId>`, and save `data/<slug>/<UTC-date>-<runId>.json`. Report `<n> completed, <m> failed` and `saved locally`. Convert it only when requested.

Add a named delivery step only when the user configured a web address or custom destination. Add its variable name and comment to `.env.example`, and put its value in ignored `.env`. Include `runId` and UTC date in delivery payloads.

## Deployment state

Store deployment identity under `package.json` `gtm.vercel` with `team`, `project`, and `url`. `Runs: on Vercel` becomes live only after [deploy](deploy.md) succeeds and a three-row pilot completes through that URL. Switching location is an update.

## Safety and persistence

Treat URLs containing credentials, tokens, keys, signatures, invitation codes, or session identifiers as unsafe. Advise rotation when exposure occurred. Apply the shared controls from `SKILL.md`.
