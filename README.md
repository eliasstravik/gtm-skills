# gtmskills-omni

A skills package repo: nine GTM skills that operate on fractal GTM context repos,
byte-identical across surfaces (desktop CLI and Vercel eve) under a seven-clause
portability contract. Shipping surface is `skills/<name>/`; committed eval
evidence lives in `evals/<name>/`.

## The nine skills (build order)

1. `gtm-setup` — create/import a GTM context repo, add suborgs and people, doctor/repair
2. `gtm-define-icp` — create or refine exactly one ICP file per run
3. `gtm-define-personas` — create or refine exactly one persona file per run
4. `gtm-account-segmentation` — assign each account one visible ICP label or `no-match` (read-only)
5. `gtm-account-scoring` — fit judgment of accounts against the matched ICP (read-only)
6. `gtm-account-research` — evidence-backed account briefs; optional promotion into the repo
7. `gtm-lead-segmentation` — assign each lead one visible persona label or `no-match` (read-only)
8. `gtm-lead-scoring` — fit judgment of leads against the matched persona (read-only)
9. `gtm-lead-research` — evidence-backed person briefs; optional promotion into the repo

## Install

```sh
npx skills add <this-repo-abs-path> --skill <name> -g
```

## The context model (G1 in five lines)

- Skills operate on **fractal GTM context repos**: one plain git repo per company; every org node has `org.md`, optional `icps/`, `personas/`, skill-owned files, and nested `suborgs/<child>/`; canonical org paths omit the `suborgs/` segments.
- **No machine state anywhere**: no `$GTM_HOME`, no `state.json`, no registry, no pins — a `state.json` found anywhere is a defect.
- **Position = cwd**: standing at the repo root is the root org; standing in `suborgs/cloud/suborgs/emea` is org `cloud/emea`; an explicit org in the request overrides for that invocation only.
- **Operator = git identity**: `git config user.name`/`user.email` matched against `people/<id>/person.md`; the operator is never the lead/account being worked on.
- **Durable writes are persist-artifact rituals**: preview the complete exact content, ask approval in the same message, write byte-for-byte, stage only the owned files, one non-amending commit, pull-rebase-and-push when a remote exists; everything else is ephemeral, response-only.
