# GTM Setup Flows

## Entry menu

Show this first unless the invocation names one mode unambiguously (an import
path, a named workspace to load, an explicit maintenance ask).

1. Check `$GTM_HOME` for directories directly under it (excluding `backups/`)
   containing a root `org.md`.
2. Ask exactly one numbered-list question:
   ```text
   What do you want to do?
   1. Set up a new GTM workspace
   2. Import a GTM workspace
   3. Load an existing GTM workspace

   Reply with a number, or type your answer.
   ```
3. Include the load option only when step 1 found at least one workspace;
   otherwise omit it and renumber.
4. Route the pick to Create, Import, or Load. Never guess the company, mode,
   or intent from memory, email domains, or prior conversations.

Maintenance actions (switch pins, add suborg, validate, repair, share, sync)
are not on the menu — run them directly when explicitly asked, keeping the
same one-question interaction rules.

## Create flow

Ask one question at a time; research and confirm before any durable write.

1. Ask: `Which org is this for? Give me the name, the website, and any
   relevant links — for example the company LinkedIn URL. Anything else
   relevant you want me to know, add it here too.`
2. Announce research before starting it (`This takes a couple of minutes — I
   am researching so you do not have to type it.`). Without network access,
   work from what the user supplied and record gaps as open questions.
3. Present findings and the complete draft `org.md` content inline —
   `Background` is the first section after the H1 — then ask in the same
   message:
   ```text
   Is this draft approved, or should I iterate?
   1. Approve and continue (Recommended)
   2. Iterate the draft

   Reply with a number, or type your answer.
   ```
   Put `(Recommended)` on iterate instead when the draft is not ready.
   User-stated facts override research.
4. Explain suborgs briefly with an example, then ask whether to set any up —
   recommend No for simple or single-motion orgs, Yes for clearly separate
   enterprise divisions or regions. For each approved suborg: ask its name,
   links, and distinguishing motion; confirm its full `org.md`; then ask
   whether to add another (No recommended).
5. Ask: `Now tell me about yourself. What's your name and your job title? Any
   links you can share — LinkedIn, personal site? Anything else that's
   relevant here, add it.` Research and confirm the complete `person.md`.
6. Classify collected links (see the contract), then show one consolidated
   preview: project id, target path, org/suborg/person ids, source-link
   treatment, git behavior, `state.json` update, and the complete content of
   every file to be created.
7. If the target path exists and is non-empty, never overwrite silently:
   offer Load or Import when it is a valid repo, or ask before archiving to
   `$GTM_HOME/backups/<name>-<timestamp>/`.
8. On confirmation: write only approved setup-owned files, `git init`, commit
   `Initialize GTM context repo`, update `state.json`, echo the resolved
   position, and give the setup summary.

## Import flow

1. Ask how to import (numbered list: local path / GitHub link).
2. GitHub link: confirm target `$GTM_HOME/<repo-name>`, clone keeping remotes
   and history. Local path under `$GTM_HOME`: register in place. Local path
   outside: ask whether to copy into `$GTM_HOME/<basename>` or register where
   it is.
3. Run the doctor checks from the contract against the repo.
4. Preview repairs: the file list, each change's purpose, and the full content
   of every file that would be written; ask approval in the same message.
   Repairs include restoring `AGENTS.md`/`CLAUDE.md`/`.gitignore` from
   templates, removing committed local state, renaming non-kebab ids, adding
   missing suborg `org.md`, moving people to root `people/`, and deleting
   empty directories.
5. Apply only after confirmation; commit `Repair GTM context repo`.
6. Register the project in `state.json`, set pins with Load logic, echo the
   resolved position, and end with a summary naming every issue fixed or left
   open.

## Load flow

1. List workspaces under `$GTM_HOME` as one numbered-list question labeled
   with each root `org.md` H1 and path.
2. On pick, set `state.json` active project.
3. No org pin yet → pin root. Exactly one root person → pin them; otherwise
   ask one numbered-list question.
4. Echo `Working in <project>/<org-path>` plus `as <person>` when resolved.
5. Close with one paragraph covering orgs, people, whether `icps/` and
   `personas/` exist, and the natural next GTM skill.

## Maintenance and repair

- Add-suborg mirrors the Create suborg loop; writes only the approved suborg
  `org.md`; updates pins only on explicit request.
- Switch-pin changes project, org, or person in `state.json` only after the
  target exists and ambiguous choices are confirmed.
- Validate reports doctor-check results without writing.
- Repair previews exact contents and differences, writes only after explicit
  confirmation.
- Share/sync require explicit request and confirmation before any push or
  external sync.

## Recovery (another GTM skill could not resolve context)

If no GTM context resolves from the prompt, current directory, or
`state.json`, say: `I could not resolve a GTM context repo from this prompt,
current directory, or local state. Run gtm-setup or tell me which GTM project
to use.` Then resolve, load, import, create, validate, or repair before
returning to the calling skill.

## Blocking rules

- No unambiguous mode named and no entry menu shown is a flow violation —
  restart from the menu.
- Create blocks on: missing company display name, missing initial person name
  or role, unresolved path collision, unsafe id, unconfirmed archive/rewrite.
- Import blocks on missing root `org.md`/`AGENTS.md` until repaired (or a new
  repo is created instead).
- Missing research facts never block — keep files sparse and record open
  questions.
- Divergent instruction files block activation until the user approves the
  differences. Never overwrite human-authored files without explicit
  confirmation.
