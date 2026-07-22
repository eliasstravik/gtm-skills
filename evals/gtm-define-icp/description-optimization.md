# gtm-define-icp — description optimization + shipping checks

Date: 2026-07-22. Process: skill-creator train/test trigger ratchet adapted
from its Claude-only runner to Codex CLI at the client's request. The
client-approved 20-query set (`trigger-eval.json`) used the same seeded 60/40
train/test split and three runs per query.

## Outcome

`best_description` (selected by held-out score) = **the existing description,
unchanged**:

> Triggers when a user asks to create, define, or refine an ideal customer profile in a GTM context repository.

Applied verbatim per plan Decision 9. Scores: train 12/12, test 8/8. Across
three gpt-5.6-luna probe runs, every positive selected `gtm-define-icp` and
every negative selected its sibling skill or `none`: 60/60 query decisions
correct. An independent gpt-5.6-terra selection pass also scored train 12/12
and held-out test 8/8.

The ratchet stopped at iteration 1 because the training set had no failures.
No gpt-5.6-sol rewrite was warranted; generating a candidate after a perfect
training score would depart from skill-creator's stopping rule. No Fable or
other Claude model was used.

## Manual frontmatter check (agentskills validate unavailable)

- `name: gtm-define-icp` — matches the directory name; lowercase letters and
  single hyphens only. PASS
- `description` — present and 109 characters; the optimizer-owned text above
  is applied verbatim and was not manually rewritten. PASS
- No unsupported extension fields; no `disable-model-invocation` (the skill
  is model-invoked). PASS
- Body: 23 lines; Recipe core has 10 ordered steps and 12 lines including its
  heading gap; Details has 6 lines; total 28 lines. One primitive in the core,
  within skill-issue's 20-line core, 80-line Details, and 100-line total
  budgets. PASS
