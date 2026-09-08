---
name: gtm-icp
description: Triggers when a user asks to create, define, refine, update, delete, or doctor an ideal customer profile file in a connected GTM workspace, including choosing which organization owns it. Not for personas or for creating, importing, deleting, or repairing the workspace repository itself. Not for qualifying or scoring leads/accounts against saved ICPs/personas.
---

# GTM ICP

## Trigger

Apply this Lifecycle SOP when the requested outcome creates, updates, repairs, or retires an ideal customer profile owned by an organization node in an existing GTM workspace.

## Scope

Own node-local, freeform Markdown ICPs at `icps/<icp-slug>/ICP.md` across creation, refinement, deletion, and repo-wide ICP integrity repair. Create and fully research ICPs with the shared company-data contract, interpreted as desired or accepted account criteria. Read legacy `icps/<icp-slug>.md` artifacts without requiring migration. Do not author persona or member files, manage the workspace lifecycle, or classify/research accounts against saved ICPs.

**Contract**

| Field | Public contract |
| --- | --- |
| Reads | Accepted ICP facts and uncertainty, the root-to-owner `ORG.md` chain, owner-local ICPs, and safe supplied sources |
| Writes | Only the selected owner's canonical ICP path, or scoped ICP repairs during doctor |
| Outputs | An accepted node-owned ICP identified by display name and owner chain, a complete health report, or a scoped handoff |
| Approval | The user accepts a plain-language proposal naming each artifact and its exact effect before any durable write or deletion; a hosted surface's native approval control may be that acceptance |
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
| Create or define is requested | Resolve the workspace and owner node, ground one or many factual drafts, check owner-local overlap, describe them, and save the accepted ICPs together |
| Update or refine is requested | Resolve one visible ICP, preserve unrelated facts, describe the change, and save the accepted revision |
| Delete is requested | Resolve one visible ICP, describe ownership and consequences, remove only the accepted target, and say it can be restored on request |
| Doctor is requested or ICP artifacts seem malformed | Inspect ICP placement and content repo-wide, describe the repair set, save it once, and report resulting health |

## Outputs

Produce the accepted node-owned ICP state, identified by display name and owner chain, or a complete ICP health report. A request owned by a sibling workflow produces only a scoped handoff and no artifact mutation.

## Exceptions

If no valid workspace is connected or discoverable, stop without writing and direct workspace creation or connection to `gtm-workspace`. If a required reference is unavailable or the environment cannot durably save the accepted operation, keep the repo unchanged and use the prescribed recovery.

## QC

- Follow the shared interaction standard for every question, proposal, approval, and closing message; ask every missing result-changing fact in one grouped message and never use `AskUserQuestion`.
- Preserve every supplied qualification, disqualifier, and uncertainty; organization facts and adjacent ICPs are a factual ceiling, never evidence for invented ICP claims.
- Keep all 13 company-data fields in the required order for every new or fully researched `ICP.md`; write `Unknown` instead of inventing or dropping unresolved criteria.
- Describe every proposed artifact and exact effect before writing and never show complete bytes unless asked; create new ICPs only at the canonical nested path, preserve legacy reads and node-local visibility, and mutate only ICP paths.
- Keep accepted changes on `main`, stage only accepted ICP paths, inspect the staged diff, and close a verified durable result with `Saved.`

## References

- Read [the ICP contract](references/contract.md) for every flow; it defines workspace resolution, ownership, visibility, content, acceptance, safety, and persistence.
- Read [the shared company-data research contract](../gtm-workspace/references/company-data.md) before creating or fully researching an ICP; apply its ordered fields as desired or accepted account criteria.
- Read [the ICP lifecycle flows](references/flows.md) after selecting the Procedure row; they define menu, create, update, delete, doctor, recovery, and closure.
- Render [the ICP draft template](templates/icp.md) only for create; it is a starting shape, not a schema or validity test.
- Read [the shared interaction standard](../gtm-workspace/references/interaction.md) before any user-facing message; it defines audience language, proposal shape, batching, grouped questions, approval by surface, and closing.
