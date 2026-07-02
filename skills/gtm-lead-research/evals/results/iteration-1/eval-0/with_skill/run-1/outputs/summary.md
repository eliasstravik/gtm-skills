# gtm-lead-research eval: one-off lead research

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 4/4

## Execution

GTM lead research complete

Dependency trace
- GTM project: northstar-compliance
- GTM workspace: fintech-compliance-outbound
- Persona source: workspaces/fintech-compliance-outbound/personas.md
- Active Person source: people/jordan-lee.md
- Hard prerequisites: context and personas found
- Composed: gtm-lead-segmentation, gtm-lead-scoring, gtm-account-research

Result
- Mode: one-off lead research
- Research priorities: Maya Chen=high/excellent-fit
- Records needing review: 0

Side effects
- No durable context write happened.
- No git commit happened.
- No CRM records were updated.
- No outreach was sent.
- No campaign triggers or syncs happened.
- No remote push happened.

## Assertions

- PASS: The one-off result assigns Maya Chen persona_label head-of-compliance, score 94, fit_label excellent-fit, research_priority high, confidence high, and needs_review false. - Maya Chen -> head-of-compliance, score=94, excellent-fit, priority=high, high, needs_review=False.
- PASS: The output includes dependency trace, persona source path, composed gtm-lead-segmentation, gtm-lead-scoring, and gtm-account-research, lead_research_brief, role_relevance, likely_priorities, account_context, risks_disqualifiers, personalization_angles, recommended_next_step, confidence, reasoning, needs_review, evidence, and open_questions. - One-off output contains dependency trace, composed skills, and required lead research fields.
- PASS: The evidence distinguishes workspace-context, saved-source-link, newly-found-evidence, and user-provided-context using the ADR 0053 provenance vocabulary. - Output uses workspace-context, saved-source-link, newly-found-evidence, and user-provided-context provenance types.
- PASS: The execution summary says no durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened. - Git status: <clean>. Summary reports no side effects.
