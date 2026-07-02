# gtm-account-segmentation eval: one-off account segmentation

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 4/4

## Execution

GTM account segmentation complete

Dependency trace
- GTM project: northstar-compliance
- GTM workspace: fintech-compliance-outbound
- ICP source: workspaces/fintech-compliance-outbound/icps.md
- Hard prerequisites: context and icps found
- Composed: none

Result
- Mode: one-off account segmentation
- Segments: HarborPay Ledger=compliance-heavy-fintech
- Records needing review: 0

Side effects
- No durable context write happened.
- No git commit happened.
- No CRM records were updated.
- No outreach was sent.
- No campaign triggers or syncs happened.
- No remote push happened.

## Assertions

- PASS: The one-off result assigns HarborPay Ledger to compliance-heavy-fintech with high confidence and needs_review false. - HarborPay Ledger -> compliance-heavy-fintech, high, needs_review=False.
- PASS: The output includes dependency trace, the ICP source path, segment_label, confidence, reasoning, needs_review, evidence, and open_questions. - One-off output contains dependency trace, ICP path, and required result fields.
- PASS: The evidence distinguishes workspace-context from user-provided-context using the ADR 0053 provenance vocabulary. - Output uses workspace-context and user-provided-context provenance types.
- PASS: The execution summary says no durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened. - Git status: <clean>. Summary reports no side effects.
