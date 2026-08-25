# GTM workflow skill evidence

Date: 2026-08-25

## Scope

- `gtm-workflow` is one Lifecycle SOP with exactly create, update, inspect, delete, and run.
- A workspace has one root `workflows/` Nitro project. Suborganization workflows live under root-relative `flows/<suborg-path>/` paths.
- The project owns local and Vercel execution, schedules, result retrieval, deployment identity, row and spend caps, and bounded Gateway-backed agent research.
- `gtm-workspace` retains ownership of workspace structure outside the workflow project.

## Paired behavioral benchmark

The executor and analyzer used `gpt-5.6-sol`. Each of ten scenarios has one candidate run and one without-skill run. Deterministic graders inspected conversation artifacts and disposable repository state.

| Configuration | Assertions | Mean scenario pass rate | Mean time | Mean normalized tokens |
| --- | ---: | ---: | ---: | ---: |
| With skill | 41/41 | 100.0% | 124.0 s | 23,271 |
| Without skill | 14/41 | 35.7% | 108.9 s | 16,812 |

The skill improved the assertion total by 27 and mean scenario pass rate by 64.3 percentage points. One run per scenario does not support statistical claims about time or token differences.

The scenarios cover local on-demand creation, scheduled Vercel creation, nested ownership, a run-location update, local health inspection, deployed-result retrieval, a capped run with one failed pilot row, scheduled deletion, missing-workspace handoff, and a deployment stopped at the Gateway-key gate.

## Workspace integration

Two `gtm-workspace doctor` scenarios validate the shared ownership boundary:

- A healthy root workflow project passed 4/4 checks and remained unchanged.
- A workflow project under a suborganization passed 5/5 checks by being identified as misplaced, routed to `gtm-workflow`, and preserved after cancellation.

## Trigger description

The current description and two Codex-proposed alternatives were each classified three times across 20 queries. Every candidate scored 60/60 overall and 24/24 held out with perfect positive recall and negative specificity. The current description remains because it reaches the same score with the smallest prompt footprint. `trigger-optimization.json` records all three candidates and the exact selected text.

## Safety isolation

The final behavioral iteration used fixture-only secrets, a minimal environment allowlist, disposable homes, and local mocks for `npm`, `vercel`, and `curl`. It inherited no Gateway, provider, or Vercel credentials. The final credential-gate transcript proves `vercel whoami` resolved to the mock identity `eval-operator`.

An earlier discarded run resolved the system Vercel CLI before the login-shell path was hardened. It ran in a disposable unauthenticated home, found no credentials, failed during discovery with no successful network access, and never linked a project, synchronized a secret, deployed, or spent money. The runner now writes a disposable `.zprofile` that forces mock resolution in login shells.

## Iteration notes

The first paired iteration scored 31/41 with the skill. Review found a real question-ordering conflict and strict grader wording. The conversation contract now makes the bold question the first non-empty line and places workspace status below it. Graders now accept semantically equivalent absent-run wording and avoid substring collisions. The targeted reruns brought the final candidate to 41/41.

The analyzer attributes the main lift to lifecycle sequencing, workspace handoff, root project ownership, saved-versus-live separation, authenticated result retrieval, spend and row guards, secret custody, per-row failure isolation, exact schedule updates, and scoped persistence.

## Verification commands

- `python3 <skill-creator>/scripts/quick_validate.py skills/gtm-workflow`
- `python3 evals/gtm-workflow/scripts/run_evals.py <iteration> --configurations with_skill,without_skill`
- `python3 evals/gtm-workflow/scripts/grade_evals.py <iteration>`
- `python3 evals/gtm-workspace/scripts/run_evals.py <iteration> --ids 12,13 --configurations with_skill`
- `python3 evals/gtm-workspace/scripts/grade_evals.py <iteration>`
- `python3 -m scripts.aggregate_benchmark <iteration> --skill-name gtm-workflow --skill-path <repo>/skills/gtm-workflow`
- `python3 <skill-creator>/eval-viewer/generate_review.py <iteration> --skill-name gtm-workflow --benchmark <iteration>/benchmark.json --static <iteration>/review.html`

The static review contains candidate and without-skill outputs, formal grades, benchmark metrics, and analyst notes.
