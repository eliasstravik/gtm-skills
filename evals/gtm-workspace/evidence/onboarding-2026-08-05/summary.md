# GTM workspace onboarding revision evidence

Date: 2026-08-05

## Authority and scope

- Implemented `/Users/eliasstravik/.consultant/gtm-workspace-onboarding-feedback/plan.md` after reading it and both named references completely.
- Applied the `gtm-workspace`, `skill-creator`, and user-invoked `skill-issue` instructions.
- Changed create onboarding, deterministic eval definitions, grading, and the controlled capability-catalog seam. Import, update, delete, doctor, templates, repository shape, and frozen historical evidence were not redesigned.

## Fresh deterministic results

| Eval | Configuration | Result |
| --- | --- | ---: |
| 1 create-simple-local | with skill | 10/10 |
| 2 create-complex-bulk | with skill | 9/9 |
| 3 import-local-folder | with skill | 6/6 |
| 4 legacy member-update scenario | with skill | 5/5 |
| 5 delete-a-suborg | with skill | 5/5 |
| 6 doctor-broken-repo | with skill | 6/6 |
| 7 hosted-create-refusal | with skill | 6/6 |
| 8 hosted-update-proceeds | with skill | 6/6 |
| 9 hosted-save-failure-recovery | with skill | 6/6 |
| 10 create-bundled-recovery | with skill | 7/7 |
| 11 create-unrecognized-workflow-fallback | with skill | 4/4 |
| 10 create-bundled-recovery | without skill baseline | 1/7 |

The with-skill total is 70/70. The preserved baseline is deliberately limited to the new interaction scenario required by the approved plan, so it is not an eleven-eval paired benchmark.

## Safety and interaction evidence

- The canonical fictional inventory is synchronized exactly with all eight shipping `Example (fictional)` lines.
- Every eval scans the same disallowed inventory across research command/MCP arguments, proposal content, and the complete generated non-git context tree.
- Evals 7–9 explicitly allow `Head of Sales` because their seeded fixture independently supplies that exact phrase; no provenance exception is inferred from output text.
- Manual transcript review confirmed readable two-question individual intake, freeform bulk intake, required-only recovery, conditional saved-suborganization choices, no standalone affiliation turn, environment-aware sharing language, and copyable completion requests.

## Validation

- `python3 scripts/check_repo_layout.py` — pass.
- `python3 /Users/eliasstravik/.agents/skills/skill-creator/scripts/quick_validate.py skills/gtm-workspace` — pass.
- `python3 -m py_compile evals/gtm-workspace/scripts/grade_evals.py evals/gtm-workspace/scripts/run_evals.py` — pass.
- `python3 evals/gtm-workspace/scripts/grade_evals.py evals/gtm-workspace/runs/onboarding-2026-08-05` — all with-skill assertions pass; required baseline preserved at 1/7.
- `git diff --check` — pass.

Raw runs, benchmark data, and the generated static review remain in the repository's ignored `evals/gtm-workspace/runs/onboarding-2026-08-05/` development area. Existing `evidence/final/` files were left byte-untouched.
