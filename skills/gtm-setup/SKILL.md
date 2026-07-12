---
name: gtm-setup
description: Set up, register, switch, validate, or extend a fractal GTM context repo. Use when the user wants to start using GTM skills, create or register a company context, change the active org/suborg or person, add a suborg, seed setup from company or profile links, join a shared repo, or recover after another gtm skill cannot resolve context.
---
# GTM Setup

Create and maintain a git-backed GTM context repo for one company. Default
`$GTM_HOME` to `~/.gtm`; local machine state lives only in
`$GTM_HOME/state.json`.

## Model

A context repo has one root company org, plus optional recursive suborgs. Every
org node has the same shape:

```text
<org>/
  org.md
  icps/
  personas/
  <skill-owned files>
  suborgs/<child-org>/
```

Root-only files are `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and
`people/<person-id>/person.md`. Folder names are lowercase kebab-case ids. The
H1 in `org.md` or `person.md` is the display name. Do not create empty
directories, placeholders, or a default suborg.

Canonical org paths omit the physical `suborgs/` segments: `cloud/emea` means
`suborgs/cloud/suborgs/emea`; root is empty.

## Interaction Rules

These rules exist because setup is a conversation, not a form. They apply to
every question in every flow below.

- One topic per question. Never bundle two subjects (e.g. org + person, or
  company + enrichment preference) into one dialog or one multi-question call.
- Choice questions — picking between known options — use an inline numbered
  list in the same visible message as the question. Do not use a tool-based
  choice widget for setup flow decisions.
- Enumerable-choice questions such as yes/no, approve/iterate, continue/stop,
  and menu picks are always numbered-list questions.
- Numbered-list format:
  - Ask one question in plain text.
  - List options as `1.`, `2.`, `3.`.
  - Mark the option you recommend exactly with `(Recommended)` when there is a
    recommendation. Omit the marker when no option is recommended.
  - End with `Reply with a number, or type your answer.`
- Every choice question must accept free-form input. Treat a typed answer as
  equivalent to selecting an option when intent is clear; otherwise ask one
  short clarifying question.
- Open-ended questions (names, links, descriptions, "tell me more") are asked
  as plain conversational text. Never use the options widget when the only
  real answer is free text, and never seed such questions with guessed
  options from memory or context.
- Review confirmations use same-turn preview-and-decision messages:
  - First show the full artifact or preview inline.
  - Immediately after the preview, ask the approval/iteration question with an
    inline numbered list.
  - Do not split the preview and decision across turns.
- Before asking approval for anything that will be written to disk, show the
  full file content inline, not summary bullets. This applies to research
  findings that will become files, draft `org.md` / `person.md` files, repair
  previews, and consolidated scaffold previews.
- Announce research before starting it: `This takes a couple of minutes — I
  am researching so you do not have to type it.` Present findings and draft
  file content inline with a same-turn numbered decision list, then get
  approval (iterating on corrections) before any durable write.
- Ask exactly one question, wait for the answer, then move to the next step.
  Do not look ahead or pre-collect answers for later steps.

## Entry Menu

Always start here when the skill is invoked, before any other action, unless
the invocation itself already names a mode unambiguously (e.g. "import
~/repos/example-gtm" or "switch to the example workspace") — then skip
straight to that flow.

1. Check `$GTM_HOME` for existing workspaces: directories directly under
   `$GTM_HOME` (excluding `backups/`) that contain a root `org.md`.
2. Ask exactly one numbered-list choice question:
   ```text
   What do you want to do?
   1. Set up a new GTM workspace
   2. Import a GTM workspace
   3. Load an existing GTM workspace

   Reply with a number, or type your answer.
   ```
   Include the load option ONLY when step 1 found at least one workspace; omit
   it entirely otherwise and renumber the remaining options sequentially. Route
   the selected option to the Create, Import, or Load flow.
3. Do not guess the company, mode, or intent from memory, email domains, or
   prior conversations. The menu is the first question, every time.

Maintenance actions (switch pins, add a suborg to an existing workspace,
validate/repair, share/sync) are not on the menu; run them directly when the
user explicitly asks for them, using the same interaction rules.

## Load Flow

1. List the workspaces found under `$GTM_HOME` as one numbered-list choice
   question. Label each with the display name (H1 of the root `org.md`) and
   its path.
2. On pick: set `state.json` active project to it. If the project has no
   pins yet, pin org to root; if exactly one person exists under `people/`,
   pin that person, otherwise ask which person to work as (numbered-list
   choice question).
3. Echo `Working in <project>/<org-path>` plus `as <person>` when resolved.
4. Finish with a one-paragraph status: which orgs and people exist, whether
   `icps/` and `personas/` are defined, and which gtm skill is the natural
   next step.

## Import Flow

1. Ask one numbered-list choice question:
   ```text
   How should I import the workspace?
   1. Local folder or repo path
   2. GitHub link

   Reply with a number, or paste the path or URL.
   ```
2. Acquire the repo:
   - GitHub link: confirm the target path `$GTM_HOME/<repo-name>`, then
     clone. Keep remotes and history intact.
   - Local path: if it already lives under `$GTM_HOME`, register it in
     place. Otherwise ask whether to copy it into `$GTM_HOME/<basename>` or
     register it where it is.
3. Run doctor checks against the expected shape:
   - Root `org.md` and `AGENTS.md` exist (hard requirement — without them
     this is not a context repo; offer Create flow or repair-by-scaffolding
     after confirmation).
   - `CLAUDE.md` contains exactly `@AGENTS.md`; `.gitignore` present.
   - `AGENTS.md`/`CLAUDE.md` match the packaged templates; substantive
     differences need explicit user approval before activation, missing
     files are repairable after preview.
   - Every `suborgs/<id>/` has an `org.md`; ids are lowercase kebab-case;
     no empty directories; people live only under root `people/`.
4. Preview any repairs using a same-turn preview-and-decision message. Include
   the file list, what changes, and the full content of every file that would
   be written, then ask for approval with a numbered list in that same
   message. Apply only after confirmation. Commit repairs as `Repair GTM
   context repo`.
5. Register the project in `state.json`, set pins (same person logic as the
   Load flow), echo the resolved context, and finish with a setup summary
   including every issue found and whether it was fixed or left open.

## Create Flow

Strictly one step at a time, in this order. Each research step follows the
Interaction Rules: announce, research, present the full draft inline, ask for
approval with a numbered list in the same message, iterate.

1. Org question — open, free text, one question:
   "Which org is this for? Give me the name, the website, and any relevant
   links — for example the company LinkedIn URL. Anything else relevant you
   want me to know, add it here too."

2. Org research and confirmation loop:
   Announce the research, then research public sources (website, LinkedIn,
   recent news). In the same message, present inline, explicitly:
   - Name: <company name>
   - Website: <url>
   - Links: <each given and discovered link, labeled, e.g. company LinkedIn>
   - What I found: a short factual summary (background, positioning,
     offers, rough size/segment) with low-confidence items marked as open
     questions rather than facts.
   - Draft `org.md`: the complete file content that would be written, using
     `Background` as the first section after the H1.
   After the draft content, ask in the same message:
   ```text
   Is this draft approved, or should I iterate?
   1. Approve and continue (Recommended)
   2. Iterate the draft

   Reply with a number, or type your answer.
   ```
   If the draft is not actually ready, put `(Recommended)` on the iterate
   option instead. Apply corrections and re-present the full draft until
   approved. Facts the user states override research.

3. Suborg question — choice, with a sized recommendation:
   First explain in a sentence or two what suborgs are for, with an example:
   in a very large organization with divisions or regions, one division,
   region, or product line may want its own GTM motion with its own ICPs and
   personas — that's a suborg. If you can do without them, simpler is better.
   Then ask "Do you want to set up any sub-orgs?" and mark the recommendation
   from the researched company size:
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

4. Suborg loop (only if yes) — for each suborg:
   a. Open question mirroring the org question: "What's the suborg's name?
      Are there any relevant links for it? Tell me more about it — anything
      that distinguishes its market, offer, or motion from the parent org."
   b. Research + confirm loop, same shape as step 2 (scoped to the suborg;
      often the user's own description is the main source — research fills
      gaps, it doesn't override them).
   c. Ask whether to add another suborg:
      ```text
      Do you want to add another sub-org?
      1. No (Recommended)
      2. Yes

      Reply with a number, or type your answer.
      ```
      Repeat until no.

5. Person question — open, free text, one question:
   "Now tell me about yourself. What's your name and your job title? Any
   links you can share — LinkedIn, personal site? Anything else that's
   relevant here, add it."

6. Person research and confirmation loop: same shape as step 2 — research,
   then present name, role, links, what-I-found, and the complete draft
   `person.md` content, followed in the same message by the numbered-list
   approval/iteration question. Iterate by re-presenting the full draft until
   approved.

7. Consolidated preview and scaffold — only after all confirmations above:
   a. Classify every collected link (see Source Links below).
   b. Show ONE same-turn preview-and-decision message: project id and
      target path, org/suborg/person ids, source-link treatment, git behavior,
      the `state.json` update, and the complete content of every file to be
      created (`org.md` per node, `person.md`, `AGENTS.md`, `CLAUDE.md`,
      `.gitignore` from templates). After the full content, ask for scaffold
      approval with a numbered list in that same message.
   c. If the target path exists and is non-empty, never overwrite silently:
      if it is already a valid context repo, offer the Load or Import flow;
      otherwise offer to archive it to `$GTM_HOME/backups/<name>-<timestamp>/`
      and recreate only after explicit confirmation.
   d. On confirmation: write the files (content from the confirmed research,
      low-confidence items under Open Questions), `git init`, commit only
      setup-owned files as `Initialize GTM context repo`, and update
      `state.json` (active project, org pin root, person pin).
   e. Write only setup-owned identity files. Do not create `icps/`,
      `personas/`, scoring files, or research folders.

## Path Safety

- Canonicalize repo roots and derived paths before reading or writing.
- Reject ids that are absolute, contain `..`, include path separators, are
  not lowercase kebab-case, or resolve outside the repo through symlinks.
- Treat `state.json` paths as authoritative; expand `~` and environment
  variables, and resolve relative paths against `$GTM_HOME` only when a
  portable context intentionally uses them.

## Source Links

Classify links before durable writes.

- Use `scripts/classify_context_links.py --stdin --json` when available,
  one URL per input line.
- Public first-party links may be saved after confirmation. Private links
  require explicit confirmation and should usually become safe labels.
- Secret-bearing, invite, tokenized, signed, credential-bearing, local-only,
  or private-tunnel links are never committed or printed back verbatim.
- Low-confidence claims become open questions, not facts.

## Local State

- `state.json` shape:
  ```json
  {
    "active": "example-org",
    "projects": {
      "example-org": {
        "path": "~/.gtm/example-org",
        "org": "cloud/emea",
        "person": "elias-stravik"
      }
    }
  }
  ```
- Project id defaults to the repo directory basename. On collision, ask
  whether to replace, rename, or keep both under distinct ids.
- Update pins only on explicit user request or as part of create/import/load.
- Never commit `state.json`.

## Git Behavior

- Initialize git by default for new repos unless the user opts out.
- Commit only setup-owned files with `Initialize GTM context repo` or
  `Repair GTM context repo`.
- Never push, open a PR, update CRM, trigger outreach, or sync externally
  unless that mode was explicitly requested and confirmed.

## Setup Summary

End every flow with a summary: resolved project, org path, person,
created/preserved/repaired/skipped/failed files, source-link handling, state
update, git status, and any open questions. Recommend `gtm-define-icp` and
`gtm-define-personas` only when those collections are absent and the user is
ready to define targeting context.

## Blocking Rules

- Skipping the entry menu (except for an unambiguous explicit mode in the
  invocation) is a flow violation — restart from the menu.
- Missing company display name, initial person display name/role, unresolved
  path collision, unsafe id, or unconfirmed archive/rewrite blocks create.
- Missing `org.md` or root `AGENTS.md` blocks import until repaired or a new
  repo is created.
- Missing research facts never block setup; keep files sparse and record
  open questions.
- Divergent instruction files block activation until the user approves the
  differences.
- Never overwrite human-authored files without explicit confirmation.

## Verification Checklist

- The entry menu was the first question, and the load option appeared only
  when a workspace actually existed.
- Every question covered exactly one topic; open-ended questions were asked
  as free text, not options; every choice question allowed free input.
- Each research or repair pass was announced, previewed with full draft file
  content inline, and approved with a same-message numbered-list decision
  before any durable write.
- Root has `org.md`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and root-only
  `people/<id>/person.md`; `CLAUDE.md` contains exactly `@AGENTS.md`.
- No empty directories or placeholder files were created.
- Org paths in `state.json` use canonical form and resolve to existing orgs.
- No local state, secrets, raw scratch, or ephemeral output was committed.
