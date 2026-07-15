---
name: gtm-setup
description: Set up, register, switch, validate, or extend a fractal GTM context repo. Use when the user wants to start using GTM skills, create or register a company context, change the active org/suborg or person, add a suborg, seed setup from company or profile links, join a shared repo, or recover after another gtm skill cannot resolve context.
---

# GTM Setup

## Decision

| Condition | Action |
| --- | --- |
| No unambiguous mode is named | Show the entry menu before any other action. |
| Set up a new workspace | Run the Create flow. |
| Import or join a local/GitHub workspace | Run the Import flow. |
| Load or switch to an existing workspace | Run the Load flow. |
| Add a suborg, switch pins, validate, repair, share, or sync | Run that explicit maintenance flow without showing the entry menu. |
| Missing or broken GTM context from another skill | Resolve, load, import, create, validate, or repair the workspace before returning to that skill. |
| Unsafe path, unsafe id, unresolved collision, or unconfirmed overwrite | Stop and ask the smallest blocking question. |

## Details

- Default `$GTM_HOME` to `~/.gtm`; local machine state lives only in `$GTM_HOME/state.json` and is never committed.
- If no GTM context resolves, say: `I could not resolve a GTM context repo from this prompt, current directory, or local state. Run gtm-setup or tell me which GTM project to use.`
- Ask exactly one question at a time, wait for the answer, then continue.
- Choice questions use inline numbered lists, accept free-form replies, and mark `(Recommended)` only when there is a recommendation.
- Open-ended questions are plain text, not option widgets, and never guess missing facts from memory.
- Preview full draft file contents, repair contents, or scaffold contents inline before any durable write, then ask approval in the same message.
- Announce research before starting it, present findings and complete draft files inline, and write only after approval.
- read [references/setup-flows.md](references/setup-flows.md) when selecting the entry menu, create, import, load, maintenance, or repair behavior.
- read [references/context-contract.md](references/context-contract.md) when resolving context, validating repo shape, handling source links, updating state, writing setup-owned files, committing, or summarizing.
- run [scripts/classify_context_links.py](scripts/classify_context_links.py) to classify collected URLs before durable writes; if unavailable, manually preserve the same safe-label and no-verbatim-secret behavior.
- Setup creates only root `org.md`, root `AGENTS.md`, root `CLAUDE.md`, root `.gitignore`, root-only `people/<person-id>/person.md`, and approved suborg `org.md` files.
- Do not create `icps/`, `personas/`, scoring files, research folders, empty directories, placeholder files, or a default suborg.
- Root `CLAUDE.md` must contain exactly `@AGENTS.md`; setup templates live in `templates/`.
- Canonical org paths omit physical `suborgs/` segments; root is empty and `cloud/emea` maps to `suborgs/cloud/suborgs/emea`.
- Reject absolute ids, `..`, path separators in ids, non-kebab ids, symlink escapes, unresolved path collisions, divergent instruction files without approval, and unconfirmed archive/rewrite.
- Secret-bearing, invite, tokenized, signed, credential-bearing, local-only, and private-tunnel links are never committed or printed back verbatim in user-facing setup output.
