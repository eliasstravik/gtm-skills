---
name: gtm-icp
description: Triggers when a user asks to create, define, refine, update, delete, or doctor an ideal customer profile file in a connected GTM workspace, including choosing which organization owns it. Not for personas or for creating, importing, deleting, or repairing the workspace repository itself.
---

# GTM ICP

## Trigger

Apply this Lifecycle SOP when the requested outcome creates, updates, repairs, or retires an ideal customer profile owned by an organization node in an existing GTM workspace.

## Scope

Own node-local, freeform Markdown ICPs at `icps/<icp-slug>/ICP.md` across creation, refinement, deletion, and repo-wide ICP integrity repair. Read legacy `icps/<icp-slug>.md` artifacts without requiring migration. Do not author persona or member files, manage the workspace lifecycle, or classify/research accounts against saved ICPs.

**Contract**

| Field | Public contract |
| --- | --- |
| Reads | Accepted ICP facts and uncertainty, the root-to-owner `ORG.md` chain, owner-local ICPs, and safe supplied sources |
| Writes | Only the selected owner's canonical ICP path, or scoped ICP repairs during doctor |
| Outputs | An accepted node-owned ICP and qualified label, a complete health report, or a scoped handoff |
| Approval | The user accepts the complete bytes and exact path operation before any durable write or deletion |
| Persists | Accepted ICP files in `main` Git history; no hidden coordination state |
| Handoff | `gtm-workspace` for repository structure or connections, `gtm-persona` for buyers, and `gtm-workflow` for saved operational work |

## Inputs

Use the user's accepted ICP facts and uncertainty, the hosting environment's connected-repo and durable-write declarations, the root-to-owner `ORG.md` chain, owner-local ICPs, and safe supplied sources.

## Roles

The agent owns the selected ICP lifecycle flow. The user accepts durable changes. `gtm-workspace` owns repository structure and connections; the hosting environment declares fixed connections and any replacement persistence mechanism.

## Procedure

| Condition | Owned flow |
| --- | --- |
| The requested outcome belongs to a sibling workflow | Hand off before workspace resolution or artifact reads; mutate nothing |
| No lifecycle verb is clear | Guide the ICP lifecycle menu and retain ownership of the selected flow |
| Create or define is requested | Resolve the workspace and owner node, ground a factual draft, check owner-local overlap, preview it, and save the accepted ICP |
| Update or refine is requested | Resolve one visible ICP, preserve unrelated facts, preview complete before/after bytes, and save the accepted revision |
| Delete is requested | Resolve one visible ICP, preview ownership and consequences, remove only the accepted target, and explain history recovery |
| Doctor is requested or ICP artifacts seem malformed | Inspect ICP placement and content repo-wide, preview one scoped repair set, save it once, and report resulting health |

## Outputs

Produce the accepted node-owned ICP state and its qualified label, or a complete ICP health report. A request owned by a sibling workflow produces only a scoped handoff and no artifact mutation.

## Exceptions

If no valid workspace is connected or discoverable, stop without writing and direct workspace creation or connection to `gtm-workspace`. If a required reference is unavailable or the environment cannot durably save the accepted operation, keep the repo unchanged and use the prescribed recovery.

## QC

- Begin every question-bearing message with its single bold question without `AskUserQuestion`; put context and numbered choices below it, mark at most option 1 `(Recommended)`, and end choices exactly `Reply with a number, or type your answer.`
- Preserve every supplied qualification, disqualifier, and uncertainty; organization facts and adjacent ICPs are a factual ceiling, never evidence for invented ICP claims.
- Preview complete accepted bytes and exact path operations before writing, create new ICPs only at the canonical nested path, preserve legacy reads and node-local visibility, and mutate only ICP paths.
- Keep accepted changes on `main`, stage only accepted ICP paths, inspect the staged diff, and describe a verified durable result as “saved to history.”

## References

- Read [the ICP contract](references/contract.md) for every flow; it defines workspace resolution, ownership, visibility, content, acceptance, safety, and persistence.
- Read [the ICP lifecycle flows](references/flows.md) after selecting the Procedure row; they define menu, create, update, delete, doctor, recovery, and closure.
- Render [the ICP draft template](templates/icp.md) only for create; it is a starting shape, not a schema or validity test.
