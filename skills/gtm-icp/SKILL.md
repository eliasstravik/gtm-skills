---
name: gtm-icp
description: Triggers when a user asks to create, define, refine, update, delete, or doctor an ideal customer profile file in a connected GTM workspace, including choosing which organization owns it. Not for personas or for creating, importing, deleting, or repairing the context repository itself.
---

# GTM ICP

## Switch

| Condition | Action |
| --- | --- |
| No clear verb is present | Guide the user to choose create, update, delete, or doctor; retain ownership of the selected flow |
| Create is requested | Resolve the context repo and owner node, ground a freeform ICP draft in that node's organization facts and local ICPs, preview it, then save the accepted file to history |
| Update is requested | Resolve the node and visible ICP, gather the change, preview complete before/after content, then save the accepted update to history |
| Delete is requested | Resolve the node and visible ICP, preview ownership and downstream consequences, then delete the accepted target with history recovery guidance |
| Doctor is requested | Inspect ICP placement, slugs, H1s, substance, and husks repo-wide; preview repairs, then save accepted repairs as one history entry |

## Details

- Ask one question per message. Render it as the first line in bold; never use `AskUserQuestion`.
- Render discrete choices as numbered options with option 1 marked `(Recommended)`, followed exactly by `Reply with a number, or type your answer.`
- After resolving the target, state `Using GTM workspace: <display name> — <N> ICPs visible` before acting or judging.
- Read only the target node's own `icps/`; root, ancestor, sibling, and descendant ICPs are not visible there.
- On create with any suborg, ask which organization owns the ICP unless the request names it; list root first as `(Recommended)`.
- Preserve every supplied qualification and disqualifier. Use org facts and adjacent ICPs to ground fit and detect duplication, never as unsupported draft claims.
- Preview complete bytes before writing; update previews include complete before and after files.
- Close accepted work with “saved to history” and the qualified label: bare slug at root, otherwise `<org-path>/<slug>`.
- Keep accepted work on `main`, stage only accepted paths, never force-push, and save doctor repairs once as `Repair ICP artifacts`.

## Calls

- Read [references/context.md](references/context.md) for every branch to resolve repos and nodes, count visibility, protect links, run the accept loop, and persist safely. If unavailable, do not write; explain that the context contract could not be loaded.
- Read [references/flows.md](references/flows.md) after the Switch match for the selected branch's exact sequence and close. If unavailable, keep the interaction read-only and explain which flow could not be loaded.
- Read [templates/icp.md](templates/icp.md) only when drafting a new ICP; use it as a starting shape, omit empty sections, and freely replace headings. If unavailable, draft a factual H1 with only useful flat H2s.
