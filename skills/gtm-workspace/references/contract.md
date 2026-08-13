# GTM workspace contract

Use this contract when creating, importing, updating, deleting, or doctoring a GTM workspace repo. The installable contract is `templates/AGENTS.md`; this reference adds operational checks and git behavior.

## Repo shape

```text
~/.gtm/<org-slug>/
├── AGENTS.md
├── CLAUDE.md
├── .gitignore
├── org.md
├── icps/<icp-slug>.md
├── personas/<persona-slug>.md
├── suborgs/<suborg-slug>/org.md
│   ├── icps/<icp-slug>.md
│   ├── personas/<persona-slug>.md
│   └── suborgs/<child-slug>/org.md
└── people/<person-slug>/person.md
```

- A repo represents one organization. Its directory slug is lowercase kebab-case.
- Every organization node has `org.md`. Suborganizations may nest through repeated `suborgs/<slug>/` directories.
- An organization node may carry `icps/` and `personas/` directories. Their files are owned and validated by the skills that manage ICPs and personas, not by gtm-workspace.
- People exist only at root under `people/<person-slug>/person.md`; their optional `Suborgs:` line contains zero or more comma-separated suborg slugs.
- The H1 of every `org.md` and `person.md` is its display name.
- `person.md` contains a non-empty `- Email:` line. Role and Suborgs are optional facts, not required guesses.
- Repos contain no machine state: no state files, registries, pins, caches, generated indexes, or hidden coordination metadata.
- Repos contain no empty directories or placeholder files. Omit unknown sections or leave a short factual note; never write TODO/TBD-only artifacts.
- Everything stays on `main`. Accepted changes are committed; history is the undo mechanism.
- Preview every durable change in chat before writing it. Accepting the first `org.md` during create also accepts the three boilerplate files.

## Content shapes

Keep content factual, flat, and small. Research may use model knowledge, public sources, or user-supplied files and folders, but the user's accept/iterate/cancel loop decides what becomes durable.

`org.md` starts with the display-name H1 and normally uses `## Overview`, `## Products & Services`, `## Links`, and `## Notes`. Omit empty sections and add another flat H2 only when the available facts make it useful. `## Links` holds plain public URLs with readable labels.

`person.md` starts with the full-name H1. `## Identity` contains `- Email:` and, when known, `- Role:` and `- Suborgs:`. `## Links` and `## Notes` are optional. Never infer a person's email.

## Link safety

Treat URLs containing credentials, tokens, keys, signatures, invitation codes, or session identifiers as unsafe. Do not open, persist, or echo the URL, even in shortened or cleaned form. Record only a plain-language source label when useful and advise the user to rotate the exposed credential. Plain public URLs are safe.

## Doctor checklist

Report healthy checks as well as defects.

1. Root contract files exist: `AGENTS.md`, `CLAUDE.md`, `.gitignore`; `CLAUDE.md` is exactly `@AGENTS.md` plus a final newline.
2. Every org node, including the root, has `org.md`; every org/person file has a display-name H1.
3. Every `icps/` or `personas/` directory is a direct child of an organization node whose `org.md` exists. Do not inspect or flag healthy files inside these skill-owned directories.
4. Repo, suborg, and person slugs are lowercase kebab-case.
5. Every person is root-only at `people/<slug>/person.md` and has a non-empty `- Email:` line; listed Suborgs resolve to existing suborg slugs.
6. No machine-state files, empty directories, placeholder files, logs, or `.tmp` content are tracked.
7. Git is initialized, the checked-out branch is `main`, and the tree is either clean or has changes that can be previewed and committed.
8. Repo-local `user.name` and `user.email` are set. The temporary identity `GTM Workspace <gtm@local>` is valid and is not a defect.
9. When a remote exists, report upstream, ahead/behind/diverged state, and authentication or reachability problems without changing anything first.

For defects, preview the exact repair operations and replacement content, then use the accept loop. Apply approved repairs as one `Repair GTM workspace repo` commit. A healthy repo changes nothing.

## Persistence contract

Every accepted durable change ends saved to history on `main`: previewed before writing, written exactly as accepted, recorded as one plain-English history entry per accepted artifact or operation set, and undoable through history. Describe the result as “saved to history.”

The background git ritual below is the default mechanism. A hosting environment may declare a different durable-write mechanism for its connected repo; that declaration replaces only the mechanism — every guarantee above still applies, and any approval step the environment adds comes after the accept loop, never instead of it. Never name, assume, or work around a specific hosted mechanism; follow the environment's own instructions for how a durable write happens. If the environment's mechanism cannot durably perform an accepted operation, stop, explain in plain English what could not be saved, and offer completing it from a CLI at a keyboard; never report an unsaved change as saved.

## Background git ritual (default mechanism)

Run this after each accepted write or in-repo deletion when no environment-declared mechanism applies:

1. Confirm the repo is on `main`; never create a branch or worktree.
2. Stage only the accepted paths and inspect the staged diff.
3. Commit once with a plain-English message such as `Add person: Jane Doe`.
4. If a remote exists, pull with rebase, then push. Set the upstream on the first push when needed. Never force-push.
5. Describe success as “saved to history,” not with commit hashes.

If any git step fails, explain what happened without jargon. Offer numbered recovery options with exactly one `(Recommended)` and the required reply line. Never change global git configuration. Create/import check that git is installed before touching the target; create starts with the temporary repo-local identity and replaces it with the operator's accepted name/email.
