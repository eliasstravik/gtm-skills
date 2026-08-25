# GTM workspace contract

Use this contract when creating, importing, updating, deleting, or doctoring a GTM workspace repo. The installable contract is `templates/AGENTS.md`; this reference adds operational checks and git behavior.

## Repo shape

```text
~/.gtm/<org-slug>/
├── AGENTS.md
├── CLAUDE.md
├── .gitignore
├── ORG.md
├── icps/<icp-slug>/ICP.md
├── personas/<persona-slug>/PERSONA.md
├── workflows/
│   ├── package.json
│   ├── flows/<workflow-slug>.ts
│   ├── flows/<suborg-path>/<workflow-slug>.ts
│   ├── lib/
│   └── server/
├── suborgs/
│   └── <suborg-slug>/
│       ├── ORG.md
│       ├── icps/<icp-slug>/ICP.md
│       ├── personas/<persona-slug>/PERSONA.md
│       ├── suborgs/<suborg-slug>/...
│       └── members/<member-slug>/MEMBER.md
└── members/<member-slug>/MEMBER.md
```

- A repo represents one organization. Its directory slug is lowercase kebab-case.
- Every organization node has `ORG.md`. A suborganization is an organization node under `suborgs/<suborg-slug>/` and may recursively contain the same `ORG.md`, `suborgs/`, and `members/` shape without a depth limit.
- Any organization node may carry `icps/` and `personas/`. The workspace root alone may carry `workflows/`, a `gtm-workflow`-owned Node project; a suborganization's workflow lives at root `workflows/flows/<suborg-path>/<slug>.ts`. New ICP and persona artifacts use `icps/<slug>/ICP.md` and `personas/<slug>/PERSONA.md`; existing flat `<slug>.md` artifacts remain compatible without migration. Artifact lifecycles belong to `gtm-icp`, `gtm-persona`, and `gtm-workflow`; `gtm-workspace` validates placement but not content.
- A member belongs to one owning organization node and lives directly below it at `members/<member-slug>/MEMBER.md`. Move the directory to change ownership; never duplicate a record implicitly.
- The H1 of every `ORG.md` and `MEMBER.md` is its display name.
- `MEMBER.md` contains a non-empty `- Email:` line. Role and `Suborganizations:` are optional facts, not required guesses. A `Suborganizations:` value records additional affiliations; the file path remains the ownership source of truth.
- Tracked content contains no machine state: no hidden coordination state, caches, generated indexes, run outputs, or logs. The workflow project's exact dependency pins and lockfile are authored content. Workflow working state is permitted only when gitignored and untracked.
- Repos contain no empty directories or placeholder files. Omit unknown sections or leave a short factual note; never write TODO/TBD-only artifacts.
- Everything stays on `main`. Accepted changes are committed; history is the undo mechanism.
- Preview every durable change in chat before writing it. Accepting the first `ORG.md` during create also accepts the three boilerplate files.

## Content shapes

Keep content factual, flat, and small. Research may use model knowledge, public sources, or user-supplied files and folders, but the user's accept/iterate/cancel loop decides what becomes durable.

`ORG.md` starts with the display-name H1 and normally uses `## Overview`, `## Products & Services`, `## Links`, and `## Notes`. Omit empty sections and add another flat H2 only when the available facts make it useful. `## Links` holds plain public URLs with readable labels.

`MEMBER.md` starts with the full-name H1. `## Identity` contains `- Email:` and, when known, `- Role:` and `- Suborganizations:`. `## Links` and `## Notes` are optional. Never infer a member's email.

## Legacy compatibility and migration

Canonical discovery accepts a workspace only when its root contains `ORG.md`. Lowercase `org.md`, `people/<person-slug>/person.md`, and `people/<person-slug>/PERSON.md` are legacy inputs, not valid canonical output.

Legacy flat `icps/<slug>.md` and `personas/<slug>.md` artifacts remain valid skill-owned inputs. `gtm-workspace` does not migrate them; `gtm-icp` and `gtm-persona` read, update, and delete them in place while writing all new artifacts in canonical nested form.

- Create writes only the canonical names and paths.
- Import and doctor inventory legacy paths recursively at every organization node. Before writing, preview each exact rename or move.
- Rename each legacy `org.md` to `ORG.md` in place.
- Move each legacy `people/<person-slug>/person.md` or `people/<person-slug>/PERSON.md` to `members/<member-slug>/MEMBER.md` under the same organization node. Rename `Suborgs:` to `Suborganizations:` while preserving its values.
- If canonical and legacy paths collide, never overwrite. Show both complete files and ask the user to merge, choose a different slug, or cancel.
- After an accepted migration, remove only legacy directories made empty by the approved moves, save one `Migrate GTM workspace layout` history entry, and rerun canonical validation. A cancelled migration leaves every byte and path unchanged.

## Link safety

Treat URLs containing credentials, tokens, keys, signatures, invitation codes, or session identifiers as unsafe. Do not open, persist, or echo the URL, even in shortened or cleaned form. Record only a plain-language source label when useful and advise the user to rotate the exposed credential. Plain public URLs are safe.

## Doctor checklist

Report healthy checks as well as defects.

1. Root contract files exist: `AGENTS.md`, `CLAUDE.md`, `.gitignore`; `CLAUDE.md` is exactly `@AGENTS.md` plus a final newline.
2. Every organization node, including every recursively nested suborganization, has `ORG.md`; every `ORG.md` and `MEMBER.md` has a display-name H1.
3. Every `suborgs/`, `members/`, `icps/`, or `personas/` directory is a direct child of an organization node whose `ORG.md` exists. `workflows/` is permitted only at the workspace root and is a `gtm-workflow` concern when found anywhere else. Canonical slug directories and compatible flat files beneath `icps/` and `personas/`, plus content beneath the root workflow project, are skill-owned; do not inspect or flag their content.
4. Repo, suborganization, and member slugs are lowercase kebab-case.
5. Every member is directly under an organization node at `members/<member-slug>/MEMBER.md` and has a non-empty `- Email:` line; listed `Suborganizations:` resolve to existing qualified suborganization paths.
6. No canonical workspace contains lowercase `org.md`, a `people/` directory, or a member file named `person.md` or `PERSON.md`; report them as migratable legacy defects rather than silently accepting or deleting them.
7. No machine-state files, empty directories, placeholder files, logs, or `.tmp` content are tracked. Inside the root workflow project, untracked `node_modules/`, `.env*` except `.env.example`, `.vercel/`, `.workflow-data/`, `.nitro/`, `.output/`, `.swc/`, and `data/` are permitted and are not defects.
8. Git is initialized, the checked-out branch is `main`, and the tree is either clean or has changes that can be previewed and committed.
9. Repo-local `user.name` and `user.email` are set. The temporary identity `GTM Workspace <gtm@local>` is valid and is not a defect.
10. When a shared copy exists, inspect its upstream, ahead/behind/diverged state, and authentication or reachability internally without changing anything first. Report whether local and shared history agree in plain language. Reveal the Git terms only when the user asks or needs them to resolve a problem.

For defects, preview the exact repair operations and replacement content, then use the accept loop. Apply approved repairs as one `Repair GTM workspace repo` commit. A healthy repo changes nothing.

## Persistence contract

Every accepted durable change ends saved to history on `main`: previewed before writing, written exactly as accepted, recorded as one plain-English history entry per accepted artifact or operation set, and undoable through history. Describe the result as “saved to history.”

The background git ritual below is the default mechanism. A hosting environment may declare a different durable-write mechanism for its connected repo; that declaration replaces only the mechanism. Every guarantee above still applies, and any approval step the environment adds comes after the accept loop, never instead of it. Never name, assume, or work around a specific hosted mechanism; follow the environment's own instructions for how a durable write happens. If the environment's mechanism cannot durably perform an accepted operation, stop, explain in plain English what could not be saved, and offer completing it from a keyboard; never report an unsaved change as saved.

## Background git ritual (default mechanism)

Run this after each accepted write or in-repo deletion when no environment-declared mechanism applies:

1. Confirm the repo is on `main`; never create a branch or worktree.
2. Stage only the accepted paths and inspect the staged diff.
3. Commit once with a plain-English message such as `Add member: Jane Doe`.
4. If a remote exists, pull with rebase, then push. Set the upstream on the first push when needed. Never force-push.
5. Describe success as “saved to history,” not with commit hashes.

If any git step fails, explain the effect on saved history or private sharing without jargon. Keep branch, remote, upstream, and command details under optional technical details unless one is needed to fix the problem. Offer numbered recovery options with exactly one `(Recommended)` and the required reply line. Never change global git configuration. Create/import check that git is installed before touching the target; create starts with the temporary repo-local identity and replaces it with the operator's accepted name/email.
