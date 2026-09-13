# Workspace contract

- Home: `~/.gtm/<org-slug>/`; one workspace holds one organization. A unit that needs its own GTM context is its own workspace; a subsidiary worth recording is prose under `## Notes` in `ORG.md`. There is no registry file.
- Slug: lowercase ASCII kebab-case, 1–40 characters, unique within its entity directory. The workspace slug is the name of its directory under `~/.gtm/`; where a checkout already exists, that directory name is the slug and the H1 never overrides it. Entity and workflow slugs derive from the display-name H1.
- Discovery order: the workspace named in the request; else the current directory or a parent that contains `ORG.md`; else every `~/.gtm/*/ORG.md`. When several match and none is named, ask; never save a preference.
- Root shape: exactly `AGENTS.md`, `CLAUDE.md`, `ORG.md`, and the directories `members/`, `icps/`, `personas/`, `workflows/` as they come into use. Never a README, `.gitignore`, or `.github` at the root; the only ignore file is `workflows/.gitignore`.
- Entity files: `ORG.md` at the root, `members/<slug>/MEMBER.md`, `icps/<slug>/ICP.md`, `personas/<slug>/PERSONA.md`; each is a copy of its template, filled in.
- Pointer files: `AGENTS.md` is exactly the two sentences in `templates/AGENTS.md`; `CLAUDE.md` is exactly `@AGENTS.md` and a newline.
- Facts come from the user, the company's own public site, and other safe public sources; never invented; unresolved means `Unknown`. A member's email comes from the user or a source, never inferred.
- Saving: state the change in one sentence; when `origin/main` exists, pull first (`git pull --ff-only`, or rebase when the branches diverged); edit through the host's normal write path, whose write gate is the approval; commit on `main` with a plain-language message; push when a remote exists, `git push -u origin main` for the first push into an empty repository; verify the commit, and that it reached `origin/main` when a remote exists; close with `Saved.`.
- Sharing is private by default: only when the user chooses to share, run `gh repo create gtm-<org-slug> --private --source . --push`; the repository is named `gtm-<org-slug>`.
- Deleting a whole workspace requires the user to type its slug; deleting an entity needs only the host's write gate.
