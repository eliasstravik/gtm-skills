# Lead research context contract

A valid repo is `~/.gtm/<org-slug>/` with root `org.md`; nested nodes live at `suborgs/<slug>/org.md`.

Resolve one repo in order: one named in the request, one the environment declares connected, then valid repos under `~/.gtm/`. If several remain, ask one bold numbered context question, mark only option 1 `(Recommended)`, and end `Reply with a number, or type your answer.` If none exists, explain that gtm-context must create or connect one and stop.

- A named node wins, including explicit root.
- Otherwise default to root. Ask which organization only when suborgs exist and multiple nodes own relevant ICPs or personas. Render the bold numbered question directly; never use `AskUserQuestion`.
- Read the root-to-target `org.md` chain for organization context.
- Read exactly the target node's own `icps/*.md` and `personas/*.md`; parent, sibling, and descendant artifacts are not visible.
- State `Using GTM context: <display name> — <N> ICPs and <M> personas visible`, using singular nouns for one.
- A person brief requires at least one visible persona. With none, preserve the label, explicitly report the missing visible-persona prerequisite, and stop without another node, priority, or brief. Emit the exact close.
