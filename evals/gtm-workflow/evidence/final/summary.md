# GTM workflow skill evidence

Date: 2026-08-24

## Scope

- `gtm-workflow` remains one Lifecycle SOP named `gtm-workflow`, with exactly setup, create, update, inspect, delete, and run.
- The nontechnical conversation rule is a chosen quality bar and approval convention inside that lifecycle skill. It did not earn a separate policy skill.
- The skill still owns node-local registries, records, tracked local implementations, target state, validation, observability, retries, ignored working state, and history safeguards.
- `gtm-workspace` keeps its existing ownership and now describes folder history and private sharing without unsolicited branch, remote, or command detail.

## Paired behavioral benchmark

Executor and deterministic grader: `gpt-5.6-sol`. Each of fourteen scenarios has one run with the final candidate and one run with the preserved PR #27 skill baseline. Timing and token counts come from Codex `turn.completed` usage.

| Configuration | Assertions | Mean scenario pass rate | Mean time | Mean total tokens |
| --- | ---: | ---: | ---: | ---: |
| Final candidate | 56/56 | 100.0% | 105.703 s | 294,471 |
| PR #27 baseline | 38/56 | 67.9% | 106.879 s | 246,625 |

- The candidate improved mean pass rate by 32.1 percentage points.
- The candidate used 47,846 more tokens per scenario on average. With one run per configuration, the 1.2-second timing difference is not evidence of a speed change.
- PR #27 retained full lifecycle behavior in triggered creation, Clay publish and cancellation cleanup, and bound-target deletion. Those cases remain regression guards.

## Communication results

- The detailed local-create case moved from 1/4 to 4/4. The final transcript used one operating-location reply, one concise approval, one scoped history entry, and no implementation-stack choice.
- Local and external runs lead with business results and explicit completed and failed counts. Default inspect reports hide workflow and run identifiers.
- `show me the workflow` produced an eight-node business diagram with one partial-failure note. The private saved-results case led with a human-readable link and an offer to stop sharing.
- The expert case exposed accurate TypeScript, SQLite, schema, entry-point, run-ID, and viewer details while labeling tracked implementation separately from ignored run state.
- The transcript checker rejects fenced implementation code, complete workflow file bodies, raw paths, telemetry, Git and scheduler mechanics, target or run identifiers, credential pointers, and unsolicited local stack products in nonexpert responses.

## Iteration

The first pass scored 48/56. Transcript inspection found one real flow defect and several grader defects. Missing-registry create used two approvals, so the flow now combines registry setup and workflow creation into one accepted change. The graders now inspect actual saved run records, accept implementation filenames chosen by the target, and grade semantic outcome wording instead of exact phrases.

Later qualitative review found target IDs, a branch name, an environment-variable name, and scheduler jargon in otherwise passing lifecycle transcripts. The final conversation standard keeps those details in records and diagnostics unless the user asks for developer detail or an identifier is needed for safe disambiguation. The final candidate scored 56/56 and passed the separate transcript checker.

## Trigger description

The trigger description remains the optimizer-selected PR #27 description. This issue changes communication behavior, not routing, so the maintained 20-query trigger result and its 20/20 selected description remain valid.

## Verification commands

- `python3 <skill-creator>/scripts/quick_validate.py skills/gtm-workflow`
- `python3 evals/gtm-workflow/scripts/check_compliance.py`
- `python3 evals/gtm-workspace/scripts/test_contract.py`
- `python3 evals/gtm-workflow/scripts/run_evals.py <iteration> --configurations with_skill,old_skill --baseline-skill-root <pr-27-snapshot>/skills/gtm-workflow`
- `python3 evals/gtm-workflow/scripts/grade_evals.py <iteration>`
- `python3 evals/gtm-workflow/scripts/check_transcripts.py <iteration> --configurations with_skill`
- `python3 -m scripts.aggregate_benchmark <iteration> --skill-name gtm-workflow` from the skill-creator directory
- `python3 <skill-creator>/eval-viewer/generate_review.py <iteration> --skill-name gtm-workflow --benchmark <iteration>/benchmark.json --static <iteration>/review.html`

The static review artifact contains candidate and PR #27 outputs, formal grades, benchmark metrics, and analyst notes.
