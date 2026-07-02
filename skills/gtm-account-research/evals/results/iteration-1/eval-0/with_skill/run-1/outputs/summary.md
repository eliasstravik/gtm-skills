# gtm-account-research eval: one-off account research

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 4/4

## Execution

GTM account research complete

Dependency trace
- GTM project: northstar-compliance
- GTM workspace: fintech-compliance-outbound
- ICP source: workspaces/fintech-compliance-outbound/icps.md
- Hard prerequisites: context and icps found
- Composed: gtm-account-segmentation, gtm-account-scoring

Result
- Mode: one-off account research
- Research priorities: HarborPay Ledger=high/excellent-fit
- Records needing review: 0

Side effects
- No durable context write happened.
- No git commit happened.
- No CRM records were updated.
- No outreach was sent.
- No campaign triggers or syncs happened.
- No remote push happened.

## Assertions

- PASS: The one-off result assigns HarborPay Ledger segment_label compliance-heavy-fintech, score 93, fit_label excellent-fit, research_priority high, confidence high, and needs_review false. - HarborPay Ledger -> compliance-heavy-fintech, score=93, excellent-fit, priority=high, high, needs_review=False.
- PASS: The output includes dependency trace, ICP source path, composed gtm-account-segmentation and gtm-account-scoring, research_brief, icp_relevance, key_signals, pain_hypotheses, likely_buying_team, risks_disqualifiers, personalization_angles, recommended_next_step, confidence, reasoning, needs_review, evidence, and open_questions. - One-off output contains dependency trace, composed skills, and required account research fields.
- PASS: The evidence distinguishes workspace-context, saved-source-link, and newly-found-evidence using the ADR 0053 provenance vocabulary. - Output uses workspace-context, saved-source-link, and newly-found-evidence provenance types.
- PASS: The execution summary says no durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened. - Git status: <clean>. Summary reports no side effects.
