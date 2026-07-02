# Scoring

This exemplar scoring model is for account and lead scoring in the `fintech-compliance-outbound` workspace.

## Fit labels

| Score | Fit label | Meaning |
|---:|---|---|
| 1-49 | `not-a-fit` | Skip or do not prioritize unless the user gives a special reason. |
| 50-74 | `good-fit` | Worth pursuing or nurturing, but not the top queue. |
| 75-89 | `great-fit` | Strong fit for active research and outreach. |
| 90-100 | `excellent-fit` | Best-fit account or lead; prioritize urgently with high-confidence personalization. |

`no-match` segmentation always maps to `not-a-fit` and must not score above 49.

## Account scoring model

Start from the account ICP segment, then score using these signals:

- ICP fit: 40 points for a strong match to one defined ICP; 20-30 for partial fit; 0 for `no-match`.
- Compliance operations pain: 25 points for visible review queues, KYC/KYB/risk workflows, audit pressure, or evidence management friction.
- Timing and trigger strength: 15 points for hiring, new market launch, policy change, onboarding backlog, or operations scaling signal.
- Company shape: 10 points for a plausible 50-1,500 employee operating range and B2B or marketplace workflow complexity.
- Evidence quality: 10 points for clear, non-conflicting evidence labels.

Set `confidence: low` when critical facts such as business model, review workflow, company size, or persona ownership are missing or ambiguous. New low-confidence results start with `needs_review: true`.

## Lead scoring model

Start from the persona segment, then score using these signals:

- Persona fit: 40 points for a direct match to one defined persona; 20-30 for adjacent operational ownership; 0 for `no-match`.
- Buying influence: 20 points for executive, head, VP, director, or clear owner status.
- Pain proximity: 20 points for owning compliance, operations, onboarding, risk, trust, safety, or review queues.
- Account fit alignment: 10 points when the lead works at a good-fit or better account.
- Evidence quality: 10 points for clear title, department, and public signal labels.

Set `needs_review: true` when the title is ambiguous, the person is interim/consulting, the account fit is low-confidence, or the evidence does not prove the lead owns the relevant workflow.

## Required result fields

Every segmentation or scoring result should include:

- segment or persona label
- numeric score
- fit label
- confidence: `low`, `medium`, or `high`
- reasoning
- needs_review: `true` or `false`
- top evidence
- open questions

Do not add a separate `review_reasons` field. Explain review triggers in `reasoning`, `open_questions`, and provenance.
