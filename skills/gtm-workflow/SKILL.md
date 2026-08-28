---
name: gtm-workflow
description: Triggers when a user wants to create, update, inspect, delete, run, approve, query, schedule, trigger, or deploy a saved GTM workflow in a GTM workspace, including typed result tables, paid provider or model calls, dry runs, checkpoints, authorized triggers, and hosted workflows. Not for creating or repairing the workspace itself, ICP or persona lifecycle work, other workflow engines, or one-off calls that are not saved as workflows.
---

# GTM workflow

## Trigger

Apply this Lifecycle SOP when a request creates, updates, inspects, deletes, runs, or opens a saved GTM workflow.

## Scope

Own the root `workflows/` Nitro project, its managed workflows, typed tables, migrations, paid-call cache and ledger, local or Vercel runtime, native inspection tools, and deployment metadata. `gtm-workspace`, `gtm-icp`, and `gtm-persona` own their respective lifecycles.

**Contract**

| Field | Public contract |
| --- | --- |
| Reads | Accepted intent, workspace ownership and context files, current workflow code, supplied rows, environment-held credentials, caps, and deployment metadata |
| Writes | The root workflow project, workflow-owned tables and adapters, committed migrations, and database rows created by accepted runs |
| Outputs | An accepted workflow change, validation or deployment state, inspection result, or database-backed run outcome |
| Approval | The user accepts tracked changes, production effect, real spend, external writes, checkpoint continuation, destruction, and credential entry |
| Persists | Source and migrations in `main` Git history; results, cache, ledger, and run index in the database; retained execution traces in the runtime |
| Handoff | `gtm-workspace` for repository structure or connections, `gtm-icp` for market definitions, and `gtm-persona` for buyer definitions |

## Inputs

Use the accepted intent, resolved GTM workspace and owner, relevant ICP and persona files, current workflow project, supplied rows, provider documentation and credentials available through the environment, accepted caps, and deployment metadata.

## Roles

The agent owns authoring, validation, dry runs, checkpointed runs, scoped changes, migrations, inspection, UI opening, and Git-connected deployment through the accepted `main` commit. The user accepts behavior, limits, tracked changes and their production deployment effect, real spend, external writes, checkpoint continuation, destruction, and credentials they must enter.

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

Produce an accepted workflow change, committed migration, validation result, deployment state, inspection, opened native tool, or database-backed run outcome.

## Exceptions

Report a run still active after the bounded poll so `gtm runs get` can retrieve it later. A duplicate live run returns the existing run key. Leave tracked state unchanged when persistence fails.

## QC

- Secrets never appear in prompts, tracked files, conversation, or command output; values move from `.env` through the shell only.
- Before editing any workflow or managed library file, read the pinned runtime's bundled documentation under `workflows/node_modules/workflow/docs/`; assume prior SDK knowledge is outdated.
- Run `gtm check` and compare every `// gtm-lib v11` header and recorded content hash before an action. Show locally modified diffs, offer a recopy, and never apply it silently.
- Copy the versioned lib, routes, scripts, and config verbatim and edit workflow-owned tables, adapters, migrations, and workflow files instead.
- Route every paid vendor call through `provider()` and every model call through `agent()`.
- Use committed migrations. The project has no `db:push` command.
- When `GTM_SANDBOX=1`, use Turso, the `api` model backend, host-approved tracked writes, and no exposed port or remote Git command. The sandbox authors, validates, dry-runs, and queries; it starts no real run. Real runs, approvals, and cancellations go through the host's trusted controls.
- Save accepted tracked changes to history on `main`.
- For `Runs: on Vercel`, state in the save gate that the `main` commit starts production deployment; do not add a second deploy gate or deploy token.
- Never use `AskUserQuestion`.
- Start, reuse, record, and stop processes only under [open](references/open.md).

## References

Read [the contract](references/contract.md) for every action, [flows](references/flows.md) for create, update, inspect, delete, or run, [open](references/open.md) for open and local server work, [conversation](references/conversation.md) for visible messages, and [deploy](references/deploy.md) before Vercel changes. Read [providers](references/providers.md) before adapter work and [agents](references/agents.md) when configuring command permissions.
