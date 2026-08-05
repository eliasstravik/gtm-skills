---
name: gtm-context
description: Triggers when the user invokes `/gtm-context` or asks to create, import, update, delete, validate, or repair a GTM context repo or folder, including adding teammates or suborganizations. Not for defining ICPs or personas, segmenting or scoring accounts, or researching accounts or leads.
---

# GTM Context

## Switch

| Condition | Action |
| --- | --- |
| Create, import, sharing setup, whole-repo deletion, or any other change to which repo is connected is requested while the repo connection is fixed by the deployment rather than owned by a human at a keyboard | Refuse and redirect using the surface refusal in `references/flows.md`; perform nothing for that request |
| No verb is clear | Guide the user to choose create, import, update, delete, or doctor; retain ownership of the chosen flow |
| Create is requested | Guide a new `~/.gtm/<org-slug>/` repo from interview through accepted artifacts, background git, optional multiplayer, and summary |
| Import is requested | Guide a local copy or GitHub clone through inventory, accepted conversion, background git, optional multiplayer, and summary |
| Update is requested | Guide target selection, accepted before/after changes, background git, and summary |
| Delete is requested | Guide target selection, consequence preview, required confirmation, deletion, history where available, and summary |
| Doctor is requested or the GTM folder seems wrong | Guide contract and git checks, accepted repairs, one repair commit, and a complete health report |

## Details

- Ask one question per message; make discrete choices a numbered list with at most one `(Recommended)`, ending exactly `Reply with a number, or type your answer.`
- Never use `AskUserQuestion`. Render each question as a clear bold question directly, place necessary context below it, then show numbered options with the recommended option first and ending in `(Recommended)`.

## Calls

- Read [references/contract.md](references/contract.md) for every matched flow to obtain the repo shape, content rules, doctor checks, link safety, and background git ritual. If unavailable, use `templates/AGENTS.md` as the minimum contract, keep people root-only, preview before writing, and stay on `main`.
- Read [references/flows.md](references/flows.md) after matching the Switch to obtain the selected flow's question order, acceptance loop, recovery, and closing summary. If unavailable, follow the matched outcome without writing until the user accepts a complete proposal.
- Read and render files from [templates/](templates/) when creating or restoring contract files; replace placeholders and omit empty optional fields or sections. If templates are unavailable, reproduce only the minimum shape from `references/contract.md` and preview every byte before writing.
