# gtm-account-research — description optimization + shipping checks

Date: 2026-07-22. The self-reviewed 20-query trigger set used three
gpt-5.6-luna routing passes and one independent gpt-5.6-terra pass per round.

## Outcome

The initial description scored 75/80. It missed approved durable promotion in
all four passes and missed one supplied-source-packet research request once.
GPT-5.6 Sol produced this `best_description`:

> Research target accounts from supplied source packets or an active GTM context: produce or refresh evidence-backed briefs, dossiers, investigations, buying-signal analysis, and fact/conflict/hypothesis/question breakdowns; also durably promote an approved account-research brief into its owning GTM organization. Not for segmentation or scoring, person or lead research, ICP/persona definition, GTM setup, generic company history, CRM writes, or governance/template design.

Applied verbatim per plan Decision 9; YAML quoting changes only serialization,
not the description value. The rewritten description scored Luna 60/60 and
Terra 20/20: every positive selected `gtm-account-research`, while every near
miss selected its sibling or `none`. No Fable or Claude model was used.

## Manual frontmatter check

- `name: gtm-account-research` matches the directory and naming grammar. PASS
- Optimizer-owned description is present and applied verbatim. PASS
- No unsupported extension fields or `disable-model-invocation`. PASS
- `quick_validate.py` passes. Recipe has 10 ordered steps; Details contains only
  assertion-earned rules; the body is 28 lines and remains within skill-issue
  line budgets.
