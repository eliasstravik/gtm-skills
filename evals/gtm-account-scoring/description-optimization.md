# gtm-account-scoring — description optimization + shipping checks

Date: 2026-07-22. The self-reviewed 20-query trigger set used three
gpt-5.6-luna routing passes and one independent gpt-5.6-terra pass.

## Outcome

`best_description` = **the existing description, unchanged**:

> Triggers when a user asks to score, rank, qualify, or prioritize accounts against an existing GTM account-scoring rubric.

Applied verbatim per plan Decision 9. Luna scored 60/60 and Terra 20/20: every
positive selected `gtm-account-scoring`; every near-miss selected its sibling or
`none`. No Sol rewrite was warranted. No Fable or Claude model was used.

## Manual frontmatter check

- `name: gtm-account-scoring` matches the directory and naming grammar. PASS
- Optimizer-owned description is present and applied verbatim. PASS
- No unsupported extension fields or `disable-model-invocation`. PASS
- `quick_validate.py` passes. Recipe has 9 ordered steps; Details contains only
  assertion-earned rules; the file remains within skill-issue line budgets.
