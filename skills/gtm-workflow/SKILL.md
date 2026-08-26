---
name: gtm-workflow
description: Triggers when a user wants to create, update, inspect, delete, or run a saved GTM workflow in a GTM workspace, including Vercel Workflows that run on this computer or on Vercel and workflows with an agent research step. Not for creating or repairing the workspace itself, ICP or persona lifecycle work, other workflow engines, or one-off provider calls that are not saved as workflows.
---

# GTM workflow

## Trigger

Apply this Lifecycle SOP when a request creates, updates, inspects, deletes, runs, or opens a saved GTM workflow.

## Scope

Own the root `workflows/` Nitro project, its managed workflows, local or Vercel runtime, results, native Workflows UI, and deployment metadata. `gtm-workspace`, `gtm-icp`, and `gtm-persona` own their respective lifecycles.

## Inputs

Use the accepted intent, resolved GTM workspace and owner, relevant ICP and persona files, current workflow project, available agent backend, deployment metadata, and supplied data.

## Roles

The agent owns authoring, validation, pilots, scoped changes, runs, inspection, UI opening, and CLI deployment. The user accepts behavior, limits, optional external delivery, tracked changes, consequential runs, deployment, destruction, and credentials they must enter.

## Procedure

| Condition | Action |
| --- | --- |
| No action is clear | Use the guided menu in [flows](references/flows.md) |
| Create | Follow create in [flows](references/flows.md) |
| Update | Follow update in [flows](references/flows.md) |
| Inspect | Follow inspect in [flows](references/flows.md) |
| Delete | Follow delete in [flows](references/flows.md) |
| Run | Follow run in [flows](references/flows.md) |
| Open | Follow [open](references/open.md) |
| No valid workspace resolves | Stop before workflow writes and hand creation or connection to `gtm-workspace` |

## Outputs

Produce an accepted workflow change, validation result, deployment state, inspection, opened UI, or saved run result.

## Exceptions

Report a run still active after the bounded poll so inspect can retrieve it later. Leave tracked state unchanged when persistence fails.

## QC

- Secrets never appear in prompts, tracked files, conversation, or command output; values move from `.env` through the shell only.
- Copy `lib/agent.ts` and both routes verbatim and never edit them in a workspace.
- Save accepted tracked changes to history on `main`.
- Never use `AskUserQuestion`.
- Start, reuse, record, and stop processes only under [open](references/open.md).

## References

Read [the contract](references/contract.md) for every action, [flows](references/flows.md) for create, update, inspect, delete, or run, [open](references/open.md) for open and local server work, [conversation](references/conversation.md) for visible messages, and [deploy](references/deploy.md) before Vercel changes.
