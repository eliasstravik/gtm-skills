# Round 2 — saturation check (no new failure classes)

Round 2 reran all three tasks in fresh no-skill contexts
(`runs/baseline/round-2/`). Every observed failure fell into a class already
preserved from round 1; per skill-issue, the baseline is saturated and the
prove-need gate closes with 18 preserved failures, none zero.

Round-2 observations, mapped to existing classes:

- **create**: same invented multi-company layout (`workspace.json`,
  `companies/<slug>/`, `internal/`) → F1.1; no `state.json` → F1.2; owner email
  again taken from session context → F1.5. **Severity variance on F1.3**: this
  round the live token was persisted verbatim in the workspace —
  `.../edit?usp=sharing&token=sk-live-9f2ma77x` in
  `companies/meridian-solar/internal/links.md` — where round 1 had stripped it.
  Secret handling without the skill is nondeterministic.
- **load-switch**: invented a *different* `state.json` schema than round 1
  (`version`/`active{workspace,orgPath,person}`/`resolvedPaths`) → F2.1. The
  schema instability across runs is itself the interop killer: two runs of the
  same task produce mutually unreadable state.
- **import-repair**: missing `AGENTS.md` and `.gitignore` again undetected →
  F3.1/F3.3; `CLAUDE.md` left broken (round 1 rewrote it wrong — both
  off-contract) → F3.2; person under suborg this time not even flagged → F3.4;
  `drafts/.gitkeep` again → F3.5; `org` pin again set to the project id →
  F3.6; repairs again approved from one-line summaries → F3.7; commit message
  `Import repair: standardize repo for GTM home` → F3.8.
