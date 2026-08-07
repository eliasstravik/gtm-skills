# GTM context contract

Use this contract when creating, importing, updating, deleting, or doctoring a GTM context repo. The installable contract is `templates/AGENTS.md`; this reference adds operational checks and git behavior.

## Repo shape

```text
~/.gtm/<org-slug>/
├── AGENTS.md
├── CLAUDE.md
├── .gitignore
├── org.md
├── suborgs/<suborg-slug>/org.md
│   └── suborgs/<child-slug>/org.md
└── people/<person-slug>/person.md
```

- A repo represents one organization. Its directory slug is lowercase kebab-case.
- Every organization node has `org.md`. Suborganizations may nest through repeated `suborgs/<slug>/` directories.
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
3. Repo, suborg, and person slugs are lowercase kebab-case.
4. Every person is root-only at `people/<slug>/person.md` and has a non-empty `- Email:` line; listed Suborgs resolve to existing suborg slugs.
5. No machine-state files, empty directories, placeholder files, logs, or `.tmp` content are tracked.
6. Git is initialized, the checked-out branch is `main`, and the tree is either clean or has changes that can be previewed and committed.
7. Repo-local `user.name` and `user.email` are set. The temporary identity `GTM Context <gtm@local>` is valid and is not a defect.
8. When a remote exists, report upstream, ahead/behind/diverged state, and authentication or reachability problems without changing anything first.

For defects, preview the exact repair operations and replacement content, then use the accept loop. Apply approved repairs as one `Repair GTM context repo` commit. A healthy repo changes nothing.

## Background git ritual

Run this after each accepted write or in-repo deletion:

1. Confirm the repo is on `main`; never create a branch or worktree.
2. Stage only the accepted paths and inspect the staged diff.
3. Commit once with a plain-English message such as `Add person: Jane Doe`.
4. If a remote exists, pull with rebase, then push. Set the upstream on the first push when needed. Never force-push.
5. Describe success as “saved to history,” not with commit hashes.

If any git step fails, explain what happened without jargon. Offer numbered recovery options with exactly one `(Recommended)` and the required reply line. Never change global git configuration. Create/import check that git is installed before touching the target; create starts with the temporary repo-local identity and replaces it with the operator's accepted name/email.
