# GTM Workspace

This repository is the durable GTM workspace for one organization.

## Shape

- The root and every `suborgs/<suborg-slug>/` organization node has `ORG.md`; suborganizations may recursively contain the same shape.
- Any organization node may carry canonical `icps/<slug>/ICP.md`, `personas/<slug>/PERSONA.md`, and `workflows/` artifacts; compatible legacy ICP and persona flat files need no migration. Their file lifecycles are owned by `gtm-icp`, `gtm-persona`, and `gtm-workflow`.
- Members live under their owning organization node at `members/<member-slug>/MEMBER.md`. Their optional `Suborganizations:` line lists additional affiliations.
- Slugs are lowercase kebab-case. Each `ORG.md` and `MEMBER.md` H1 is the display name; every member has an `Email:` line.
- Do not track hidden coordination state, pins, caches, generated indexes, run outputs, logs, empty directories, or placeholder files. Skill-authored Markdown registries are ordinary content; skill-owned working state inside `workflows/` is allowed only when gitignored and untracked.

## Changes

- Work only on `main`.
- Preview durable changes in chat and write them only after acceptance.
- Commit each accepted artifact. Git history is the undo mechanism.
- Persist accepted changes with the durable-write mechanism your environment declares; otherwise, if a remote exists, pull with rebase and push. Never force-push, and never report an unsaved change as saved.
