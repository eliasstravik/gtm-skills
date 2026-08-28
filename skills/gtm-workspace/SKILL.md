---
name: gtm-workspace
description: Triggers when the user invokes `/gtm-workspace` or asks to create, import, update, delete, validate, migrate, or repair a GTM workspace repo or folder, including adding members or suborganizations. Not for defining ICPs or personas, or for tasks that merely use an existing workspace without changing or validating it.
---

# GTM Workspace

## Trigger

Apply this Lifecycle SOP when the requested outcome creates, imports, maintains, validates, repairs, or retires the GTM workspace itself.

## Scope

Own the plain-Markdown workspace at `~/.gtm/<org-slug>/` across creation, import, organization and member maintenance, legacy-shape migration, structural or Git repair, and deletion. Preserve node-owned ICP and persona artifacts without authoring or validating their contents.

**Contract**

| Field | Public contract |
| --- | --- |
| Reads | The user's accepted organization facts, repository connection rules, valid local workspaces, and safe supplied sources |
| Writes | Workspace contract files, organization nodes, member files, repository configuration, and accepted structural repairs |
| Outputs | The requested workspace state and path summary, a complete health report, or a fixed-connection refusal |
| Approval | The user accepts every durable change and any whole-workspace deletion before it happens |
| Persists | Accepted workspace files and configuration in `main` Git history; no hidden coordination state |
| Handoff | `gtm-icp` for market definitions, `gtm-persona` for buyer definitions, and `gtm-workflow` for saved workflows |

## Inputs

Use the user's request and accepted facts, the hosting environment's repo connection and durable-write declarations, valid local workspaces, and safe supplied sources.

## Roles

The agent owns the selected lifecycle flow. The user accepts durable changes and whole-workspace deletion. The hosting environment declares fixed connections and any replacement persistence mechanism.

## Procedure

| Condition | Owned flow |
| --- | --- |
| A fixed-connection deployment receives create, import, sharing setup, whole-workspace deletion, or another connection-changing request | Refuse and redirect through the surface-refusal flow; perform nothing for that request |
| No lifecycle verb is clear | Guide the lifecycle menu and retain ownership of the selected flow |
| Create is requested | Guide a new workspace from intake through accepted artifacts, history, optional sharing, and summary |
| Import is requested | Guide a local copy or GitHub clone through inventory, accepted conversion, history, optional sharing, and summary |
| Update is requested | Resolve the target, preview accepted before/after changes, save them to history, and summarize |
| Delete is requested | Resolve the target, preview consequences, obtain the required confirmation, delete, and explain recovery where available |
| Doctor or migration is requested, or the workspace seems wrong | Run every contract, legacy-shape, and Git check; preview accepted repairs or migrations; save one change set; and report complete health |

## Outputs

Produce the requested workspace state and a path-based summary, or a complete health report for doctor. A refused fixed-connection operation produces only the prescribed explanation and CLI redirect.

## Exceptions

If a required reference is unavailable, use `templates/AGENTS.md` as the minimum contract, keep every member under its owning organization node at `members/<member-slug>/MEMBER.md`, stay on `main`, and write nothing until the user accepts a complete proposal. If the environment cannot durably save an accepted operation, stop and offer the prescribed CLI recovery; never report it as saved.

## QC

- Begin each question-bearing message with its single bold question without `AskUserQuestion`; place status, context, guidance, examples, and numbered choices below it, mark at most one choice `(Recommended)`, and end discrete choices exactly `Reply with a number, or type your answer.`
- Preview every durable workspace action before writing, apply exactly the accepted proposal, and preserve compatibility with the workspace contract. Use folder, history, and private-sharing language by default; keep branch, remote, upstream, and command details internal unless a problem requires them or the user asks.
- Keep accepted changes on `main`, stage only accepted paths, inspect the staged diff, and describe a verified durable result as “saved to history.”
- Close only after every selected-flow completion criterion in `references/flows.md` is satisfied.

## References

- Read [the workspace contract](references/contract.md) for every flow; it defines storage, content, link safety, doctor checks, and persistence.
- Read [the guided flows](references/flows.md) after selecting the Procedure row; it defines question order, acceptance, recovery, and closure.
- Render [templates](templates/) when creating or restoring contract files, replacing placeholders and omitting empty optional fields or sections.
