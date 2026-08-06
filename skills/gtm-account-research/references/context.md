# Account research context contract

A valid repo is `~/.gtm/<org-slug>/` with root `org.md`; nested nodes live at `suborgs/<slug>/org.md`.

## Repo resolution

Resolve one repo in order: one named in the request, one the environment declares connected, then valid repos under `~/.gtm/`. If several remain, ask `**Which GTM context should I use?**`, list numbered display-name/path choices with only option 1 `(Recommended)`, and end `Reply with a number, or type your answer.` If none exists, explain that gtm-context must create or connect one and stop.

## Node and visibility

- A node named in the request wins for this invocation, including explicit root.
- Otherwise default to root. Ask `**Which organization should I use for research?**` only when suborgs exist and more than one node owns ICPs or personas. Use numbered display-name choices, only option 1 `(Recommended)`, and the exact reply line.
- Render questions directly and never use `AskUserQuestion`.
- Read the root-to-target chain of `org.md` files for organization context.
- Read exactly `<target-node>/icps/*.md` and `<target-node>/personas/*.md`. Parent, sibling, and descendant artifacts are not visible.
- State `Using GTM context: <display name> — <N> ICPs and <M> personas visible`; use singular nouns for one.
- An account brief requires at least one visible ICP. With none, preserve the supplied label, report the missing prerequisite, and stop without inspecting another node, assigning priority, or rendering a brief. Emit the exact close.
