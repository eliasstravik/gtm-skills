# gtm-define-personas — description optimization + shipping checks

Date: 2026-07-22. Process: skill-creator's seeded 60/40 trigger ratchet,
adapted from its Claude-only runner to Codex CLI at the client's request. The
self-reviewed 20-query set used three runs per query.

## Outcome

`best_description` = **the existing description, unchanged**:

> Triggers when a user asks to create, define, or refine a buyer or stakeholder persona in a GTM context repository.

Applied verbatim per plan Decision 9. Scores: train 12/12, held-out test 8/8.
All three gpt-5.6-luna passes routed every positive to
`gtm-define-personas` and every near-miss to its sibling or `none`: 60/60
correct decisions. Independent gpt-5.6-terra selection also scored 20/20.

The ratchet stopped at iteration 1 because training had no failures. No Sol
rewrite was warranted under skill-creator's stopping rule. No Fable or Claude
model was used.

## Manual frontmatter check (agentskills validate unavailable)

- `name: gtm-define-personas` matches the directory and naming grammar. PASS
- Optimizer-owned description is present, 114 characters, and applied
  verbatim. PASS
- No unsupported extension fields or `disable-model-invocation`. PASS
- Body: 27 lines; Recipe has 10 ordered steps; Details has 10 earned lines;
  total file length 32 lines. One core primitive and all skill-issue line
  budgets pass.
