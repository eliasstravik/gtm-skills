# gtm-lead-research — description optimization + shipping checks

Date: 2026-07-22. The self-reviewed 20-query trigger set used three
gpt-5.6-luna routing passes and one independent gpt-5.6-terra pass.

## Outcome

`best_description` = **the existing description, unchanged**:

> Research individual leads or contacts from supplied source packets or an active GTM context, including person briefs, outreach preparation, buying-role hypotheses, personalization angles, and approved durable person-research promotion.

Applied verbatim per plan Decision 9. Luna scored 60/60 and Terra 20/20: every
positive selected `gtm-lead-research`; every near-miss selected its sibling or
`none`. No Sol rewrite was warranted. No Fable or Claude model was used.

## Manual frontmatter check

- `name: gtm-lead-research` matches the directory and naming grammar. PASS
- Optimizer-owned description is present and applied verbatim. PASS
- No unsupported extension fields or `disable-model-invocation`. PASS
- `quick_validate.py` passes. Recipe has 10 ordered steps; Details contains only
  assertion-earned rules; the file remains within skill-issue line budgets.
