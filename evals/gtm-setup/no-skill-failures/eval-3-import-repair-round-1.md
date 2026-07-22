# No-skill failures — eval-3 import-repair, round 1

Run: `runs/baseline/round-1/eval-3-import-repair/` (claude-fable-5, no_skill
arm). Diligent run: preserved git history, removed committed state, renamed
`EU_Sales`, built `marine/org.md` from the scratchpad. But it missed hard
doctor requirements entirely, normalized one violation instead of fixing it,
and inverted another.

## F3.1 — missing `AGENTS.md` never detected or restored [critical]

`AGENTS.md` is a hard doctor requirement ("without it this is not a context
repo"). The final tree has no `AGENTS.md`; the inspection list never mentions
its absence. The baseline instead treated the broken `CLAUDE.md` prose as the
repo's instructions.

## F3.2 — `CLAUDE.md` not repaired to `@AGENTS.md`

Contract: root `CLAUDE.md` contains exactly `@AGENTS.md`. Final content,
verbatim:

```text
# Harbor Metrics

Internal notes live in org.md. Suborg context lives under suborgs/ (eu-sales,
marine), each with its own org.md.

Note: suborgs/marine/ was inherited as an unfinished draft from the previous
maintainer during the repo handoff; verify its contents before relying on them.
```

## F3.3 — missing `.gitignore` never detected or restored

Not in the inspection list, not in the final tree.

## F3.4 — person under a suborg left in place (violation normalized) [critical]

`suborgs/marine/people/jonas-berg/person.md` stayed put — the baseline even
"repaired" it by adding a missing section, entrenching the violation. Contract:
people live only under root `people/`.

## F3.5 — empty directory preserved via placeholder (inverted fix)

Transcript Q2 item 7, verbatim: "`drafts/` is empty and untracked, so it would
vanish on clone. Fix: add a `.gitkeep`." Contract: no empty directories or
placeholder files — the repair is to remove `drafts/`, not enshrine it.

## F3.6 — state pins semantically wrong

`gtm-home/state.json` got `"org": "harbor-metrics"` — a project id, not a
canonical org path (root is the empty string). And `person: null` although
exactly one root person exists (`kate-osei`), whom load logic would pin. Note
the shape (`active`/`projects`/`path`) was only right because the fixture's
committed-state defect leaked it — the schema was copied from the file being
condemned.

## F3.7 — repairs approved from one-line summaries, not full file contents

Q2 lists fixes as single lines ("rename to `suborgs/eu-sales/`", "create a
standard `org.md` from the scratchpad content"). Contract: preview full content
of every file that would be written, then ask approval in the same message.

## F3.8 — repair commit message off-contract

Committed as `Normalize repo after handoff import`; contract commits repairs
as `Repair GTM context repo`.

## Recurring (already preserved)

- No `Working in <project>/<org-path>` echo (F2.2).
- No closing setup summary with collection status and next skill (F2.4).
