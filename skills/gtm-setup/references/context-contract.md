# GTM Context Contract

## Repo model

One context repo per company, normally at `$GTM_HOME/<project-id>/` (default
`$GTM_HOME` is `~/.gtm`). Every org node — root and each `suborgs/<id>/` — has
this shape:

```text
<org>/
  org.md
  icps/          (only when defined)
  personas/      (only when defined)
  <skill-owned files>
  suborgs/<child-org>/
```

- Root-only files: `AGENTS.md`, `CLAUDE.md` (containing exactly `@AGENTS.md`),
  `.gitignore`, `people/<person-id>/person.md`. People never live under
  suborgs.
- Ids are lowercase kebab-case; the H1 of `org.md`/`person.md` is the display
  name.
- Never create empty directories, placeholder files (no `.gitkeep`), or a
  default suborg.
- Canonical org paths omit physical `suborgs/` segments: root is the empty
  path; `cloud/emea` resolves to `suborgs/cloud/suborgs/emea`.

## Machine state

`$GTM_HOME/state.json` is the only local machine state, is never committed
inside any repo, and has exactly this shape:

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

- `active` is a project id; `projects.<id>.path` is the repo location;
  `org` is a canonical org path (`""` = root); `person` is a root person id.
- Project id defaults to the repo directory basename. On collision, ask
  whether to replace, rename, or keep both under distinct ids.
- Update pins only on explicit user request or as part of create, import, or
  load. If a project has no org pin, pin root; if exactly one root person
  exists, pin that person, otherwise ask one numbered-list question.
- A `state.json` found committed inside a repo is a defect: remove it from the
  repo and rebuild correct state at `$GTM_HOME/state.json`.

## Path safety

- Canonicalize repo roots and derived paths before reading or writing; expand
  `~` and environment variables; treat `state.json` paths as authoritative.
- Reject ids that are absolute, contain `..` or path separators, are not
  lowercase kebab-case, or resolve outside the repo through symlinks.

## Source links

- Classify every collected URL before any durable write.
- Public first-party links may be saved after confirmation.
- Private links require explicit confirmation and usually become safe labels
  (e.g. `internal pricing sheet — ask <owner>`).
- Secret-bearing, tokenized, signed, invite, credential-bearing, local-only,
  and private-tunnel links are never persisted anywhere in the workspace and
  never echoed verbatim back in user-facing output — gitignoring a file that
  contains one does not make it safe. Strip nothing, store nothing: safe label
  only, and recommend rotation if a live credential was shared.
- Low-confidence claims become open questions, not facts.

## Doctor checks (import and validate)

- Root `org.md` and root `AGENTS.md` are hard requirements — without them this
  is not a context repo.
- `CLAUDE.md` contains exactly `@AGENTS.md`; `.gitignore` is present.
- `AGENTS.md` and `CLAUDE.md` match the packaged templates unless the user
  approves substantive differences.
- Every `suborgs/<id>/` has an `org.md`; ids are lowercase kebab-case.
- No empty directories; people only under root `people/`; no committed local
  state, secrets, scratch, or logs.

## Git behavior

- Initialize git by default for new repos unless the user opts out.
- Commit only setup-owned files, as `Initialize GTM context repo` (create) or
  `Repair GTM context repo` (import/repair).
- Never push, open a PR, update a CRM, trigger outreach, or sync externally
  unless that was explicitly requested and confirmed.

## Setup summary

End every flow with: resolved project, org path, person; files
created/preserved/repaired/skipped/failed; source-link handling; `state.json`
update; git status; open questions. Recommend `gtm-define-icp` and
`gtm-define-personas` only when those collections are absent and the user is
ready to define targeting context.
