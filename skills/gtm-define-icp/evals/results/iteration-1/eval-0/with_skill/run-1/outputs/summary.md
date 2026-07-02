# gtm-define-icp eval: create ICP definitions

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 5/5
- Commit: 005797c556be79a1bd114f532e92252e9e137069

## Execution

User: Use gtm-define-icp to create ICP definitions for Northstar Compliance's active fintech compliance outbound workspace.

Assistant: Resolved GTM Context Project `northstar-compliance` at `<temporary>/gtm-home/northstar-compliance` and active workspace `fintech-compliance-outbound`.

About to update GTM context:
- workspaces/fintech-compliance-outbound/icps.md - create ICP definitions
- Sections: Compliance-heavy fintech, Regulated B2B SaaS, Marketplace KYC / risk friction, No Match
- Preserved files: organization.md, people/jordan-lee.md, workspaces/fintech-compliance-outbound/context.md

Will create git commit:
Create ICP definitions

No outreach will be sent.
No CRM records will be updated.
No campaign triggers, syncs, or remote push will happen.
No external systems will be changed.

Proceed?

User: Proceed.

Assistant: GTM context update complete.
- Created: workspaces/fintech-compliance-outbound/icps.md
- Segments: compliance-heavy-fintech, regulated-b2b-saas, marketplace-kyc-risk, no-match
- Git commit created: 005797c556be79a1bd114f532e92252e9e137069
- No outreach, CRM update, campaign trigger, sync, external side effect, or remote push happened.

## Assertions

- PASS: The preview names workspaces/fintech-compliance-outbound/icps.md, sections to create, the commit message, and states no outreach, CRM update, campaign trigger, sync, remote push, or other external side effect will happen. - Preview includes target file, sections, commit intent, and no external side effects.
- PASS: The created icps.md includes the three Northstar account ICP machine labels plus no-match, and does not include persona definitions. - Machine labels found: compliance-heavy-fintech, marketplace-kyc-risk, no-match, regulated-b2b-saas; no persona headings found.
- PASS: Each created segment includes strong signals, disqualifiers, provenance/source notes, confidence, reasoning, needs_review, and open questions. - Every non-no-match segment includes signals, disqualifiers, provenance/source notes, confidence, reasoning, needs_review, and open questions.
- PASS: The auto-commit exists, uses the Create ICP definitions subject, and changes only workspaces/fintech-compliance-outbound/icps.md. - Commit 005797c5 subject 'Create ICP definitions' changed: workspaces/fintech-compliance-outbound/icps.md.
- PASS: The GTM scaffold checker passes and local active registry state remains outside the GTM Context Repository. - Scaffold checker passed; registry is under temp GTM_HOME, not the project repo; target file was clean before write.
