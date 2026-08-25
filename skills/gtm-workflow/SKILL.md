---
name: gtm-workflow
description: Triggers when a user wants to create, update, inspect, delete, or run a saved GTM workflow in a GTM workspace, including Vercel Workflows that run on this computer or on Vercel and workflows with an agent research step. Not for creating or repairing the workspace itself, ICP or persona lifecycle work, other workflow engines, or one-off provider calls that are not saved as workflows.
---

# GTM Workflow

## Trigger

Apply this Lifecycle SOP when a request manages a saved GTM workflow through create, update, inspect, delete, or run.

## Scope

Own the root `workflows/` Nitro project, workflow files under `flows/`, their local or Vercel runtime, result retrieval, and deployment metadata. Do not own the surrounding workspace, ICPs, personas, other workflow engines, or unsaved provider work.

## Inputs

Use the accepted operating intent, resolved GTM workspace and owner node, relevant ICP and persona files, current workflow project, available CLI agents or Gateway connection, deployment metadata, and safe supplied data.

## Roles

The agent owns authoring, validation, pilots, scoped file changes, local runs, inspection, and CLI deployment. The user accepts workflow behavior, limits, result destination, durable changes, consequential runs, and credentials they must create or enter. `gtm-workspace` owns workspace structure outside the workflow project.

## Procedure

| Condition | Owned flow |
| --- | --- |
| The request belongs to workspace, ICP, persona, account-research, or lead-research lifecycle work | Hand off before workflow reads or mutations |
| No valid workspace resolves | Stop without writing, name `gtm-workspace` as the owner, and direct workspace creation or connection there |
| No lifecycle verb is clear | Guide the five-option lifecycle menu in [the flows](references/flows.md) |
| Create is requested | Silently bootstrap the project when absent; always ask where it should run with the required local and Vercel notes; resolve kind, owner, inputs, caps, and results destination; author and validate the workflow; pilot it; propose the exact durable change; save it; deploy only through the separate gate |
| Update is requested | Resolve the workflow, preserve the file contract, validate and pilot the requested change, update schedule state when needed, propose and save exact bytes, then deploy when its `Runs:` choice requires it |
| Inspect is requested | Inspect one workflow or the project without mutation; show the business process when requested; fetch a selected local, deployed, or long-running run result on request |
| Delete is requested | Preview recovery and the exact file and schedule consequences, accept the durable deletion, remove only those artifacts, validate, and save |
| Run is requested | Resolve scope, prove three rows when possible, calculate projected spend, gate the full scope when cost or writes matter, start through the authenticated HTTP route, save the returned result, and report completed and failed rows |

## Outputs

Produce an accepted workflow project change, validated workflow, deployment state, inspection report, or saved JSON run result. Durable workflow changes are saved to history; run state and results remain ignored.

## Exceptions

If a run exceeds the bounded polling window, report it as still running and let inspect fetch it later. If persistence is unavailable, leave durable state unchanged and use the recovery flow.

## QC

- Apply [the conversation standard](references/conversation.md) to every visible message: one bold question, numbered choices, at most one `(Recommended)`, the exact reply line, and no `AskUserQuestion`.
- Keep the verb set exactly create, update, inspect, delete, and run.
- Enforce [the workflow contract](references/contract.md): header shape, step discipline, plain step arguments, naming, one-attempt agent calls, and schema-checked output.
- Copy `lib/agent.ts` and both API routes verbatim. Never edit them in a workspace.
- Keep secrets out of prompts, tracked files, and conversation. Move values from `.env` through the shell only.
- Enforce `MAX_ROWS` and projected `MAX_SPEND_USD` before the first spending step; pass `maxUsd: COST_PER_ROW_USD` to every `agent()` call.
- Record every per-row failure in `failed`; one row must never fail the workflow run.
- Start pilots and full runs through the HTTP route with an explicit body. Use the local workflow binary only to validate, inspect, or cancel.
- Before presenting the local Workflows UI, refresh its graph manifest and verify that both workflow definitions and run history load.
- Save accepted tracked changes to history on `main`. Keep `.env`, runtime state, and `data/` ignored.

## References

- Read [the workflow contract](references/contract.md) for every flow.
- Read [the lifecycle flows](references/flows.md) after selecting the Procedure row.
- Read [the conversation standard](references/conversation.md) for every user-visible turn.
- Read [the deployment flow](references/deploy.md) before any Vercel action.
- Copy [templates](templates/) verbatim during bootstrap; customize only workflow files, environment names, package deployment metadata, and schedule configuration as the references permit.
