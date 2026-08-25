# GTM workflow contract

Use this contract for every workflow lifecycle flow.

## Contents

- [Workspace resolution and ownership](#workspace-resolution-and-ownership)
- [Project shape](#project-shape)
- [Workflow file contract](#workflow-file-contract)
- [Runtime semantics](#runtime-semantics)
- [House rules](#house-rules)
- [Results and connections](#results-and-connections)
- [Deployment state](#deployment-state)
- [Safety and persistence](#safety-and-persistence)

## Workspace resolution and ownership

Resolve the workspace in order: a repo named in the request; the repo the environment declares connected; canonical repos under `~/.gtm/`, where root `ORG.md` makes a repo valid. If several remain, ask `**Which GTM workspace should I use?**`, list display name and path, and save no preference. If none exists, stop without writing and hand creation or connection to `gtm-workspace`.

A request-named organization node wins. Otherwise root is the default unless the requested workflow belongs to exactly one other node. For create, if any suborganization exists and none was named, ask `**Which organization should own this workflow?**`, listing root first as `(Recommended)` and then every nested node by display name.

The workflow project belongs to the workspace root even when a workflow belongs to a suborganization. A root workflow is `flows/<slug>.ts`. A suborganization workflow is `flows/<suborg-path>/<slug>.ts`, with physical `suborgs/` segments omitted. Its header names the owning node and ICP.

Before acting or judging, state `Using GTM workspace: <display name> | <N> workflows visible`, using `workflow visible` for one. In a question-bearing message, put this status immediately below the opening bold question so the question remains the first non-empty line.

## Project shape

```text
<workspace>/
├── ORG.md
├── icps/
├── personas/
├── members/
├── suborgs/
└── workflows/
    ├── .env.example
    ├── .env                         # ignored
    ├── package.json
    ├── package-lock.json
    ├── nitro.config.ts
    ├── vercel.json                  # only when schedules exist
    ├── flows/
    │   ├── <slug>.ts
    │   └── <suborg-path>/<slug>.ts
    ├── lib/agent.ts
    ├── server/api/run/[...workflow].ts
    ├── server/api/runs/[runId].get.ts
    └── data/                        # ignored
```

Tracked state is the project scaffold, workflow files, schedule configuration, `.env.example`, lockfile, and deployment metadata in `package.json`. Ignored state is `node_modules/`, `.env*` except `.env.example`, `.vercel/`, `.well-known/`, `.workflow-data/`, `.nitro/`, `.output/`, `.swc/`, and `data/`.

Only the root node may contain the `workflows/` project. Never create `suborgs/<slug>/workflows/`.

## Workflow file contract

Every workflow uses a lowercase kebab-case filename and exports its camelCase basename. For example, `qualify-leads.ts` exports `qualifyLeads`.

The leading header is exactly five lines for on-demand and triggered workflows, and six for scheduled workflows:

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

The file then exports:

- `input`, a Zod schema;
- `MAX_ROWS`;
- `MAX_SPEND_USD`;
- `COST_PER_ROW_USD`;
- `scheduledInput` when `Kind: scheduled`; and
- the camelCase workflow function.

A scheduled function starts like this, with no default parameter:

```ts
export async function qualifyLeads(arg: Input) {
  "use workflow";
  arg ??= scheduledInput;
```

Every return value is shaped `{ completed, failed }`. Each failed entry is `{ row, error }`. Inputs, output schemas, and caps stay in code beside the function rather than in a separate record.

## Runtime semantics

The authenticated run route maps `/api/run/<path>/<kebab-name>` to:

```text
workflow//./flows/<path>/<kebab-name>//<camelCaseName>
```

POST starts a run with the explicit request body. GET starts a run with no arguments and exists for Vercel cron. The result route returns status while pending and the workflow return value when complete. Both routes return 401 when `GTM_RUN_SECRET` is empty or the bearer differs.

`Runs: on this computer` means the file runs under local `nitro dev`. Scheduled and triggered workflows still run only when the user or agent invokes them. `Runs: on Vercel` means the project is deployed and its production URL is recorded. Scheduled workflows then use Vercel cron; cron is best effort and may double-fire. On Hobby, schedules run at most once per day and may fire at any point within the specified hour.

Use `./node_modules/.bin/workflow` for validate, inspect, and cancel only. Nitro compiles workflows during `npm run dev` and `npm run build`. Workflow v5 embeds the local Workflows UI in the Nitro development server at `/_workflow`; the `dev` script sets `WORKFLOW_EMBEDDED_DATA_DIR=node_modules/.nitro/workflow` so the current v5 beta reads Nitro's generated graph manifest as well as `.workflow-data/`. Pilots and full runs always start through the HTTP route.

## House rules

These are chosen project rules. Apply each wrong/right pair when authoring or reviewing a workflow.

| Rule | Wrong | Right |
| --- | --- | --- |
| Side effects run in steps | Call a provider or webhook directly in the workflow body | Put the call in a function whose first statement is `"use step"` |
| Step arguments are plain data | Pass a Zod schema, class, function, or other non-serializable value into a step | Convert schemas to JSON Schema before the step and validate the plain result back in the workflow body |
| Shared runtime files stay canonical | Modify `lib/agent.ts` or either route for one workflow | Copy all three files verbatim from the templates and customize the workflow file |
| Agent tools are least-privilege | Enable research by default or put a credential in the prompt | Default to `tools: "none"`; use `tools: "web"` only when web evidence is required; keep secrets outside prompts |
| Agent calls have one bounded attempt | Add retries or omit the per-row bound | Let `runAgent.maxRetries = 0` stand and pass `maxUsd: COST_PER_ROW_USD` to every `agent()` call |
| Agent output fields are structurally present | Use `.optional()` for a field the agent may omit | Use `.nullable()` because strict output schemas require every property |
| Rows fail independently | Let one provider or agent exception escape the row loop | Catch each row, append `{ row, error }` to `failed`, and continue |
| Provider usage is explicit | Hide provider calls or costs in a shared wrapper | Put data-provider calls in steps, name each key in `.env.example`, and pin provider, endpoint, and cost per row in the header; Monid is one possible provider |
| Caps precede spend | Check limits after an agent or provider call | Project `rows × COST_PER_ROW_USD` and reject `MAX_ROWS` or `MAX_SPEND_USD` violations before the first spending step |
| Scheduled delivery is deduplicable | Treat cron as exactly-once or key delivery by wall-clock time alone | Include `runId` and a UTC date key in every delivery payload |
| Delivery is unconditional | Call the result webhook only for one workflow kind | Always call the delivery step; it posts to `GTM_RESULTS_URL` when set and otherwise returns without delivery |
| Template upgrades refresh local code | Keep `nitro dev` running after `lib/` changes | Restart `nitro dev` after any template upgrade that touches `lib/` |
| Local observability has a current graph | Assume run history makes source workflows discoverable | Let Nitro rebuild after workflow changes, then verify the embedded UI's `fetchWorkflowsManifest` response contains the expected workflow |

The pre-step spend check is a projection. The Claude backend also enforces `maxUsd` per row. The API backend relies on the spending budget attached to `AI_GATEWAY_API_KEY`; it makes one attempt and surfaces the budget error.

No provider SDK packages or model-provider keys belong in the scaffold. The API backend is Vercel AI Gateway. Provider contracts may be configured behind that Gateway key.

## Results and connections

The workflow return value is the authoritative result. After completion, fetch it through `GET /api/runs/<runId>` and save:

```text
data/<slug>/<UTC-date>-<runId>.json
```

Report `<n> completed, <m> failed` from the two lists and say `saved locally` with the result path. Convert JSON to CSV or a spreadsheet only when requested; do not create a sidecar by default.

The only shipped delivery destination is `GTM_RESULTS_URL`. Its payload contains `runId`, workflow slug, UTC date key, `completed`, and `failed`. A receiver uses `runId` plus the date key to dedupe.

`.env.example` is the connection list. Add variable names and comments there, but values only to ignored `.env`. The generated `GTM_RUN_SECRET` protects both routes. A triggered caller receives the secret only by the user opening `workflows/.env`; never print or copy it into conversation.

## Deployment state

The `gtm` key in `package.json` stores only non-secret deployment identity:

```json
{
  "gtm": {
    "vercel": {
      "team": "<team>",
      "project": "<project>",
      "url": "<production-url>"
    }
  }
}
```

`Runs: on Vercel` is live only after [the deployment flow](deploy.md) succeeds and a three-row pilot completes through that URL. Run and remote inspect read the recorded values. Switching run location is an update.

## Safety and persistence

Treat URLs containing credentials, tokens, keys, signatures, invitation codes, or session identifiers as unsafe. Do not open, persist, or echo them. Advise rotation when a secret was exposed.

Before a durable change, inspect the complete draft and actual diff, then show the proposal and acceptance block from `conversation.md`. A change response updates and revalidates the draft. Cancellation writes no tracked bytes.

Every accepted tracked change ends saved to history on `main`, limited to accepted paths and recoverable through history. An environment-declared durable-write mechanism may replace Git but must preserve the same preview and scoped-write guarantees.

Without a replacement mechanism: confirm `main`; stage only accepted paths; inspect the staged diff; commit one plain-English history entry; and, when a remote exists, pull with rebase then push without force. If persistence is unavailable, leave the workspace unchanged, explain what could not be saved, and offer keyboard recovery. A verified close says `saved to history` without naming branches, remotes, commands, or commits unless the user asks for developer detail.
