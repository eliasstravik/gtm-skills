---
name: gtm-workflow
description: Triggers when a GTM workspace request says set up workflow targets, create or build an automation, update or publish it, inspect its state or workflow health, delete it, or run it with saved target semantics. Use for reusable Clay, n8n, Vercel Workflows, local TypeScript, enrichment, CRM-cleaning, inbound, outbound, scheduled, and triggered workflows. Not for GTM workspace creation/import/repair, ICP or persona lifecycle work, account or lead research/scoring, GitHub Actions, or an unsaved one-off call through a provider plugin.
---

# GTM Workflow

## Trigger

Apply this Lifecycle SOP when the requested outcome manages a saved GTM workflow, target, or connection through setup, creation, update or publication, inspection, deletion, or execution.

## Scope

Own node-local workflow registries and records under `workflows/`, tracked local-target implementation files, and the corresponding target-side workflow lifecycle. Do not own the GTM workspace, ICPs, personas, provider-specific research, or transient run data.

## Inputs

Use the user's accepted operating intent, the hosting environment's connected-repo and durable-write declarations, the resolved organization node, its workflow registry and records, available target tooling, and safe supplied sources.

## Roles

The agent owns the selected lifecycle flow, implementation choices, internal diff review, and target-native validation. The user accepts the behavior, affected systems, durable paths, and consequential go-live or run scope, and performs target-side actions unavailable to the agent. `gtm-workspace` owns workspace structure; target prose and installed backend skills own backend operations.

## Procedure

| Condition | Owned flow |
| --- | --- |
| The request belongs to workspace, ICP, persona, account-research, or lead-research lifecycle work | Hand off before workflow reads or mutations |
| No valid workspace resolves | Stop without writing and direct workspace creation or connection to `gtm-workspace` |
| The resolved node lacks `workflows/WORKFLOWS.md` | Ask where and when the workflow should run; during create, combine the provisional registry with the workflow proposal and save them together |
| No lifecycle verb is clear | Guide the six-option lifecycle menu and retain ownership of the selected flow |
| Setup is requested, including “create a target” | Discover viable targets and connections, interview for missing operating facts, and save the accepted registry and ignore lines |
| Create is requested | Resolve owner and target, agree the operating design, build and validate a draft, save the accepted record and tracked implementation, then complete or defer go-live |
| Update or publish is requested | Resolve a workflow or registry entry, apply and validate the requested draft change when any, save the accepted revision, then complete or defer go-live |
| Inspect is requested | Read one workflow's target state and runs without mutation, show its business process or saved results when requested, or run the no-argument node health check and offer one accepted repair set |
| Delete is requested | Preview consequences and recovery, distinguish target-side deletion from record-only unmanagement, then remove only the accepted workflow or unbound registry entry |
| Run is requested | Resolve record through target prose, honor limits, gate consequential scope and cost with a pilot option, execute, and report results in chat |

## Outputs

Produce the accepted node-owned registry, record, tracked implementation, target-side workflow state, or health report. Runs produce an outcome-first report while run state remains target-side or gitignored.

## Exceptions

If required operating prose is incomplete, update it through setup before relying on that target. If a draft was created and the user cancels, offer target-side cleanup. If durable save is unavailable, leave no record-less artifact and use the contract recovery flow.

## QC

- Apply [the conversation standard](references/conversation.md) to every visible message. Begin a question-bearing message with one bold question, render discrete choices as a numbered list with at most option 1 marked `(Recommended)`, end discrete choices exactly `Reply with a number, or type your answer.`, and never use `AskUserQuestion`.
- Keep the verb set exactly setup, create, update, inspect, delete, and run; treat publish as update and target/node health as inspect.
- Dereference every workflow through its named target, validate before go-live, preserve the design → draft → accept real bytes → go-live order, and never leave an agent-created target artifact without a saved record.
- Review every tracked record, config, and local implementation byte internally before writing. Show the user the accurate behavior and affected-path summary, write only the reviewed draft after acceptance, keep secrets and run state untracked, save accepted changes on `main`, and describe verified persistence as “saved to history.”
- Close create and update with exact live-versus-draft state and how to finish; when deferred on a draft/publish target, state that the live version still runs the old logic.
- During create at a node without a registry, use one location choice and one combined save proposal for the registry, ignore rules, record, and implementation.

## References

- Read [the workflow contract](references/contract.md) for every flow; it defines node ownership, registry and record content, target viability, acceptance, run gating, safety, and persistence.
- Read [the conversation standard](references/conversation.md) for every flow; it defines the chosen operating-language quality bar, proposal summary, diagrams, outcome reports, and expert detail route.
- Read [the lifecycle flows](references/flows.md) after selecting the Procedure row; they define setup, create, update, inspect, delete, run, recovery, and closure.
- Render [templates](templates/) only as prose starting shapes for a registry, record, or target section; replace prompts and omit unsupported or empty material.
