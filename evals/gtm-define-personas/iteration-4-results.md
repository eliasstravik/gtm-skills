# gtm-define-personas — iteration 4 accepted results

Date: 2026-08-02. This is the done-gate benchmark.

| Eval | with skill | without skill |
| --- | ---: | ---: |
| create-first-persona | 17/17 | 9/17 |
| refine-existing-persona | 18/18 | 12/18 |
| altitude-mismatch | 18/18 | 7/18 |
| **Overall** | **53/53 (100.0%)** | **28/53 (52.8%)** |

Models used, exactly:

- Skill authoring, assertion strengthening, and final autonomous self-review: `gpt-5.6-sol`, high reasoning.
- All six executor arms: `gpt-5.6-terra`, medium reasoning.
- All six independent graders: `gpt-5.6-sol`, high reasoning.
- Benchmark analyst and all three blind comparators: `gpt-5.6-terra`, high reasoning.
- Trigger optimization, run separately after acceptance: `gpt-5.6-terra`, low reasoning.

No Claude-family model, Claude Code, `claude` CLI, Fable model, or model-invoking skill-creator script was used for Task 3.

Every critical and noncritical with-skill assertion passes. The three treatment repos are clean with exactly a fixture commit plus one owned-file commit; all task Git uses `git -C` at the copied context root. The refinement's captured `## Call Notes` bytes and SHA-256 match exactly. Every non-target fixture file and setup template remains byte-identical. No run accessed `~/.gtm`, a real context repo, home config, or machine state.

Accepted treatment executor wall-clock times were 132s, 127s, and 129s (mean 129.3s); baselines were 75s, 79s, and 94s (mean 82.7s). Token counts are honestly unavailable and recorded as zero because the completion interface exposed no token data.

The static review was generated before the final self-review. The accepted blind assignment varied treatment between A and B; after unblinding, the skill won all three comparisons. The final review read every accepted treatment and baseline transcript, checked actual artifacts and Git evidence, and returned empty actionable feedback.

## Iteration history

- Iteration 1, bare core: 40/53 with skill versus 27/53 without. It exposed exact position/source/closing-report failures, incorrect child-ICP ownership evidence, a child-local preview path, and unsupported buying-authority inference.
- Iteration 2, first evidence-earned Details treatment: 51/53 versus 27/53. It fixed artifact and reporting behavior; remaining failures were an abbreviated saved closing transcript and missing explicit Git-root proof.
- Iteration 3, nominally green: 53/53 versus 23/53. Harsh self-review still found a kebab id used as `Display name` and punctuation added to a protected line, so assertions A and S2 were strengthened before acceptance.
- Iteration 4, accepted: 53/53 versus 28/53. Every critical and noncritical assertion passed and autonomous feedback was empty.

This single accepted-results file consolidates the earlier iteration summaries so the committed evidence follows PLAN G6's one-`iteration-N-results.md` shape without losing the changes, reasons, or benchmark history.
