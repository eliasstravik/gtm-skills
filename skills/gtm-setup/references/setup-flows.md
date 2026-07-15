# GTM Setup Flows

## Entry Menu

Start here unless the invocation names a mode unambiguously, such as importing a path or switching to a named workspace.

1. Check `$GTM_HOME` for directories directly under it, excluding `backups/`, that contain a root `org.md`.
2. Ask exactly one numbered-list question:
   ```text
   What do you want to do?
   1. Set up a new GTM workspace
   2. Import a GTM workspace
   3. Load an existing GTM workspace

   Reply with a number, or type your answer.
   ```
3. Include the load option only when step 1 found at least one workspace; omit it otherwise and renumber sequentially.
4. Route the selected option to Create, Import, or Load.
5. Do not guess the company, mode, or intent from memory, email domains, or prior conversations.

Maintenance actions such as switching pins, adding a suborg, validating, repairing, sharing, or syncing are not on the menu. Run them directly when the user explicitly asks for them, while preserving the same one-question interaction rules.

## Load Flow

1. List workspaces under `$GTM_HOME` as one numbered-list choice question, labeled with the root `org.md` H1 and path.
2. On pick, set `state.json` active project to it.
3. If the project has no org pin yet, pin org to root.
4. If exactly one person exists under `people/`, pin that person; otherwise ask one numbered-list question for which person to work as.
5. Echo `Working in <project>/<org-path>` plus `as <person>` when resolved.
6. Finish with one paragraph covering orgs, people, whether `icps/` and `personas/` exist, and the natural next GTM skill.

## Import Flow

1. Ask:
   ```text
   How should I import the workspace?
   1. Local folder or repo path
   2. GitHub link

   Reply with a number, or type your answer.
   ```
2. For a GitHub link, confirm target path `$GTM_HOME/<repo-name>`, then clone while keeping remotes and history intact.
3. For a local path already under `$GTM_HOME`, register it in place.
4. For a local path outside `$GTM_HOME`, ask whether to copy into `$GTM_HOME/<basename>` or register where it is.
5. Run doctor checks against root `org.md`, root `AGENTS.md`, `CLAUDE.md`, `.gitignore`, templates, suborg shape, kebab ids, no empty dirs, and root-only people.
6. Preview repairs with file list, change purpose, and full content of every file that would be written.
7. Ask for repair approval in the same message; apply only after confirmation and commit repairs as `Repair GTM context repo`.
8. Register the project in `state.json`, set pins using Load logic, echo resolved context, and finish with a setup summary naming every issue fixed or left open.

## Create Flow

Strictly ask one question at a time and run research confirmation loops before any durable write.

1. Ask: `Which org is this for? Give me the name, the website, and any relevant links — for example the company LinkedIn URL. Anything else relevant you want me to know, add it here too.`
2. Announce: `This takes a couple of minutes — I am researching so you do not have to type it.`
3. Research public sources, then present name, website, labeled links, factual findings, low-confidence open questions, and complete draft `org.md` content with `Background` as the first section after the H1.
4. Ask in the same message:
   ```text
   Is this draft approved, or should I iterate?
   1. Approve and continue (Recommended)
   2. Iterate the draft

   Reply with a number, or type your answer.
   ```
5. If the draft is not ready, put `(Recommended)` on iterate instead; user-stated facts override research.
6. Explain suborgs briefly with an example, then ask whether to set up any suborgs; recommend No for simple/single-motion orgs and Yes for clearly separate enterprise divisions or regions.
   - Small or single-motion company:
     ```text
     Do you want to set up any sub-orgs?
     1. No (Recommended)
     2. Yes

     Reply with a number, or type your answer.
     ```
   - Large enterprise with clearly separate divisions/regions:
     ```text
     Do you want to set up any sub-orgs?
     1. Yes (Recommended)
     2. No

     Reply with a number, or type your answer.
     ```
7. For each approved suborg, ask its name, links, and distinguishing motion; research and confirm its full `org.md`; then ask:
   ```text
   Do you want to add another sub-org?
   1. No (Recommended)
   2. Yes

   Reply with a number, or type your answer.
   ```
8. Ask: `Now tell me about yourself. What's your name and your job title? Any links you can share — LinkedIn, personal site? Anything else that's relevant here, add it.`
9. Research and confirm the person profile with name, role, links, findings, and complete `person.md` content.
10. Classify collected links, then show one consolidated preview with project id, target path, org/suborg/person ids, source-link treatment, git behavior, `state.json` update, and complete content for every file to be created from templates and approved drafts.
11. If the target path exists and is non-empty, never overwrite silently; offer Load or Import when it is valid, or ask before archiving to `$GTM_HOME/backups/<name>-<timestamp>/`.
12. On confirmation, write only approved setup-owned files, `git init`, commit `Initialize GTM context repo`, and update `state.json`.

## Maintenance And Repair

- Add-suborg mode mirrors the Create suborg loop, writes only the approved suborg `org.md`, and updates pins only when explicitly requested.
- Switch-pin mode changes project, org, or person in `state.json` only after the target exists and the user confirms ambiguous choices.
- Validate mode checks repo shape and reports issues without writing.
- Repair mode previews exact file contents and differences, then writes only after explicit confirmation.
- Share or sync modes require explicit user request and confirmation before any remote push or external sync.

## Blocking Rules

- Skipping the entry menu without an unambiguous explicit mode is a flow violation; restart from the menu.
- Missing company display name, initial person display name or role, unresolved path collision, unsafe id, or unconfirmed archive/rewrite blocks create.
- Missing root `org.md` or root `AGENTS.md` blocks import until repaired or a new repo is created.
- Missing research facts never block setup; keep files sparse and record open questions.
- Divergent instruction files block activation until the user approves the differences.
- Never overwrite human-authored files without explicit confirmation.
