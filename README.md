# gtmskills

Nine GTM skills rebuilt from scratch on eval-first foundations (skill-creator
process, skill-issue form).

Skills, in build order: `gtm-setup`, `gtm-define-icp`, `gtm-define-personas`,
`gtm-account-segmentation`, `gtm-account-scoring`, `gtm-account-research`,
`gtm-lead-segmentation`, `gtm-lead-scoring`, `gtm-lead-research`.

## Install

```bash
npx skills add /Users/eliasstravik/dev/gtmskills --skill <name> -g
```

## Context model

The skills operate on a fractal GTM context repo per company: a root org plus
`suborgs/<id>/` children, each with `org.md`; `icps/` and `personas/` per org;
`people/` at root only. Local machine state lives solely in `$GTM_HOME/state.json`
(default `~/.gtm`) and is never committed.

## Repo layout

- `skills/<name>/` — the shipping skill (installers receive exactly this).
- `evals/<name>/` — committed eval sources: prompts, assertions, fixtures.
- Generated run output is gitignored. See `CLAUDE.md` for the full conventions.
