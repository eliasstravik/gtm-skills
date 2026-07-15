# GTM Setup Context Contract

## Repo Model

A GTM context repo represents one company. The root org may contain recursive suborgs; every org node has this shape:

```text
<org>/
  org.md
  icps/
  personas/
  <skill-owned files>
  suborgs/<child-org>/
```

Root-only files are `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and `people/<person-id>/person.md`. Folder names are lowercase kebab-case ids. The H1 in `org.md` or `person.md` is the display name. Do not create empty directories, placeholders, or a default suborg.

Canonical org paths omit physical `suborgs/` segments. Root is empty. `cloud/emea` resolves to `suborgs/cloud/suborgs/emea`.

## Interaction Contract

- Ask one topic per question; never bundle org plus person, company plus enrichment preference, or approval plus another decision.
- Choice questions use a visible inline numbered list with `1.`, `2.`, `3.`, accept free-form input, and end with `Reply with a number, or type your answer.`
- Mark exactly one option with `(Recommended)` when a recommendation exists; omit the marker when none exists.
- Treat a typed answer as equivalent to an option when intent is clear; otherwise ask one short clarifying question.
- Open-ended questions are plain conversational text and never use option widgets.
- Review confirmations show the full artifact or preview inline, then immediately ask an approve/iterate numbered-list question in the same message.
- Durable writes require full file content inline before approval, including research findings, draft `org.md`, draft `person.md`, repair previews, and consolidated scaffold previews.

## Path Safety

- Canonicalize repo roots and derived paths before reading or writing.
- Reject ids that are absolute, contain `..`, include path separators, are not lowercase kebab-case, or resolve outside the repo through symlinks.
- Treat `state.json` paths as authoritative; expand `~` and environment variables.
- Resolve relative paths against `$GTM_HOME` only when a portable context intentionally uses them.

## Source Links

Classify links before durable writes.

- Use `scripts/classify_context_links.py --stdin --json` when available, with one URL per input line.
- Public first-party links may be saved after confirmation.
- Private links require explicit confirmation and usually become safe labels.
- Secret-bearing, invite, tokenized, signed, credential-bearing, local-only, and private-tunnel links are never committed or printed back verbatim.
- Low-confidence claims become open questions, not facts.

## Local State

`state.json` has this shape and is never committed:

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

Project id defaults to the repo directory basename. On collision, ask whether to replace, rename, or keep both under distinct ids. Update pins only on explicit user request or as part of create, import, or load.

## Import Doctor Checks

- Root `org.md` and root `AGENTS.md` are hard requirements; without them this is not a context repo.
- `CLAUDE.md` contains exactly `@AGENTS.md`.
- `.gitignore` is present.
- `AGENTS.md` and `CLAUDE.md` match the packaged templates unless the user approves substantive differences.
- Every `suborgs/<id>/` has an `org.md`.
- Ids are lowercase kebab-case.
- No empty directories exist.
- People live only under root `people/`.

## Git Behavior

- Initialize git by default for new repos unless the user opts out.
- Commit only setup-owned files with `Initialize GTM context repo` or `Repair GTM context repo`.
- Never push, open a PR, update CRM, trigger outreach, or sync externally unless that mode was explicitly requested and confirmed.

## Setup Summary

End every flow with resolved project, org path, person, created/preserved/repaired/skipped/failed files, source-link handling, state update, git status, and open questions. Recommend `gtm-define-icp` and `gtm-define-personas` only when those collections are absent and the user is ready to define targeting context.

## Verification Checklist

- Entry menu was the first question unless the invocation named an unambiguous mode.
- Load appeared only when at least one workspace existed.
- Each question covered one topic and accepted free-form input when it was a choice.
- Each research or repair pass was announced, previewed with full draft file content inline, and approved with a same-message numbered-list decision before any write.
- Root has `org.md`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and root-only `people/<id>/person.md`.
- `CLAUDE.md` contains exactly `@AGENTS.md`.
- No empty directories or placeholder files were created.
- Org paths in `state.json` use canonical form and resolve to existing orgs.
- No local state, secrets, raw scratch, or ephemeral output was committed.
