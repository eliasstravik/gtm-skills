# gtm-lead-scoring eval: one-off lead scoring

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 4/4

## Execution

GTM lead scoring complete

Dependency trace
- GTM project: northstar-compliance
- GTM workspace: fintech-compliance-outbound
- persona source: workspaces/fintech-compliance-outbound/personas.md
- Scoring source: workspaces/fintech-compliance-outbound/scoring.md
- Hard prerequisites: context, personas, and scoring criteria found
- Composed: gtm-lead-segmentation

Result
- Mode: one-off lead scoring
- Scores: Maya Chen=94/excellent-fit
- Records needing review: 0

Side effects
- No durable context write happened.
- No git commit happened.
- No CRM records were updated.
- No outreach was sent.
- No campaign triggers or syncs happened.
- No remote push happened.

## Assertions

- PASS: The one-off result assigns Maya Chen persona_label head-of-compliance, score 94, fit_label excellent-fit, confidence high, and needs_review false. - Maya Chen -> head-of-compliance, score=94, excellent-fit, high, needs_review=False.
- PASS: The output includes dependency trace, persona source path, scoring source path, composed gtm-lead-segmentation, score, fit_label, evidence_summary, positives, risks_disqualifiers, recommended_action, confidence, reasoning, needs_review, evidence, and open_questions. - One-off output contains dependency trace, source paths, composed segmentation, and required fields.
- PASS: The evidence distinguishes workspace-context from user-provided-context using the ADR 0053 provenance vocabulary. - Output uses workspace-context and user-provided-context provenance types.
- PASS: The execution summary says no durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened. - Git status: <clean>. Summary reports no side effects.
