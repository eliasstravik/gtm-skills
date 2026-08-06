# Account segmentation context contract

A valid context repo is `~/.gtm/<org-slug>/` with a root `org.md`; nested nodes live at `suborgs/<slug>/org.md`.

## Repo resolution

Resolve one repo for this invocation in order:

1. A repo explicitly named in the request.
2. A repo the environment declares connected.
3. Valid repos under `~/.gtm/`.

If the last step finds several, ask `**Which GTM context should I use?**` as the first line. List display name and path as numbered choices, mark only option 1 `(Recommended)`, and end exactly `Reply with a number, or type your answer.` Never save the choice. If none exists, explain that gtm-context must create or connect one and stop without classification or side effects.

## Node and visibility

- A node named in the request wins for this invocation, including an explicit root.
- Without a named node, inspect which nodes carry their own `icps/*.md`. If exactly one does, use it as the obvious target. If none does, use root.
- If more than one node carries ICPs, ask `**Which organization should I use for segmentation?**` as the first line. Render numbered node choices, mark only option 1 `(Recommended)`, and end exactly `Reply with a number, or type your answer.`
- Ask no other question. Render questions directly; never use `AskUserQuestion`.
- Read exactly `<target-node>/icps/*.md`. Root, ancestor, sibling, and descendant ICPs are not visible; there is no inheritance, shadowing, or nearest-file precedence.
- State `Using GTM context: <target display name> — <N> ICPs visible` before any judgment; use `1 ICP visible` for one.
- When the target has no visible ICPs, say segmentation cannot proceed until that node has an ICP, then emit the required no-side-effects close. Do not use another node's ICP, ask a question, invent a definition, or assign `no-match`.

## Source safety

Segmentation is supplied-facts-only. Do not use web access or open links. Never echo or retain credentials, tokens, keys, signatures, invitation codes, or session identifiers embedded in a supplied value; refer to a safe plain source label only when necessary.
