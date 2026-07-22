---
name: gtm-setup
description: Set up, register, switch, validate, or repair a fractal GTM context repo. Use when the user wants to start using GTM skills, create or import a company context, load or switch the active workspace, org, or person, add a suborg, or when another gtm skill cannot resolve its context.
---

# GTM Setup

## Switch

| Condition | Action |
| --- | --- |
| No unambiguous mode is named | Show the entry menu (create / import / load) before any other action. |
| Set up a new company workspace | Run the Create flow. |
| Import or join an existing context repo (local path or GitHub) | Run the Import flow. |
| Load or switch the active workspace, org, or person | Run the Load flow. |
| Explicit maintenance ask (add suborg, switch pins, validate, repair, share, sync) | Run that flow directly, without the menu. |
| Another GTM skill could not resolve context | Resolve, repair, or create the workspace, then return to that skill. |
| Unsafe path or id, unresolved collision, or unconfirmed overwrite | Stop and ask the smallest blocking question. |

## Details

- Default `$GTM_HOME` to `~/.gtm`. The only machine state is
  `$GTM_HOME/state.json`, in the exact schema in the contract reference; a
  `state.json` committed inside a repo is a defect to remove.
- Ask exactly one question at a time and wait for the answer. Choice questions
  are inline numbered lists ending `Reply with a number, or type your
  answer.`, with at most one `(Recommended)`. Open-ended questions are plain
  text, never option widgets.
- Never guess missing facts from memory, session context, or email domains —
  ask the user, or record an open question instead of a value.
- Before any durable write, preview the complete content of every file to be
  written inline, and ask approval in the same message. A field summary or
  file list is not a preview.
- Echo `Working in <project>/<org-path>` plus `as <person>` as soon as context
  resolves, before acting on it.
- End every flow with the setup summary defined in the contract reference.
- Setup creates only: root `org.md`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`,
  root `people/<person-id>/person.md`, and approved suborg `org.md` files —
  scaffolded from `templates/`. Never create `icps/`, `personas/`, scoring or
  research files, empty directories, placeholder files, or a default suborg.
- Root `CLAUDE.md` contains exactly `@AGENTS.md`.
- Ids are lowercase kebab-case; reject ids that are absolute, contain `..` or
  path separators, or escape the repo through symlinks.
- Secret-bearing, tokenized, signed, invite, credential-bearing, local-only,
  and private-tunnel links are never persisted anywhere in the workspace —
  a gitignored file still persists them — and never echoed verbatim in
  user-facing output. Store a safe label; recommend rotating any live
  credential the user pasted.
- Git: initialize new repos by default; commit only setup-owned files, as
  `Initialize GTM context repo` or `Repair GTM context repo`; never push,
  sync, or touch external systems without an explicit, confirmed request.
- read [references/setup-flows.md](references/setup-flows.md) when running the
  entry menu or any create, import, load, maintenance, repair, or recovery
  flow — it defines each flow's steps and blocking rules.
- read [references/context-contract.md](references/context-contract.md) when
  resolving context, validating or repairing repo shape, classifying source
  links, or writing `state.json` — it defines the repo model, state schema,
  doctor checks, and setup summary.
