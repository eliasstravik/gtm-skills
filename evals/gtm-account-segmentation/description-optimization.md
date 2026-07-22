# gtm-account-segmentation — description optimization + shipping checks

Date: 2026-07-22. Process: skill-creator's seeded trigger ratchet, adapted to
Codex CLI with GPT-5.6 at the client's request. The self-reviewed 20-query set
used three Luna runs per query plus an independent Terra pass.

## Outcome

`best_description` = **the existing description, unchanged**:

> Triggers when a user asks to classify or segment accounts against visible ICPs in a GTM context repository.

Applied verbatim per plan Decision 9. All three gpt-5.6-luna passes routed every
positive to `gtm-account-segmentation` and every near-miss to its sibling or
`none`: 60/60 correct decisions. Independent gpt-5.6-terra selection scored
20/20. The ratchet stopped because there were no failures, so no Sol rewrite was
warranted. No Fable or Claude model was used.

## Manual frontmatter check

- `name: gtm-account-segmentation` matches the directory and naming grammar. PASS
- Optimizer-owned description is present, 107 characters, and applied verbatim. PASS
- No unsupported extension fields or `disable-model-invocation`. PASS
- `quick_validate.py` passes. Body: 22 lines; Recipe has 8 ordered steps;
  Details has 7 earned lines; total file length is 27 lines. One core primitive
  and all skill-issue line budgets pass.
