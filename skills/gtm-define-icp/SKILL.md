---
name: gtm-define-icp
description: Triggers when a user asks to create, define, or refine an ideal customer profile in a GTM context repository. Not for personas or for segmenting, scoring, or researching accounts or leads.
---

# Define an ICP

## Recipe

1. Derive the repo root, canonical org position from cwd, and operator from root git identity, honoring an explicit org or operator for this invocation only.
2. Echo `Working in <repo-name>/<org-path> as <person>` before acting, omitting the org suffix at root and the person clause when unresolved and unnecessary.
3. Read the root-to-target `org.md` chain, the resolved root `people/<id>/person.md`, and every inherited or local visible ICP as repo-relative sources.
4. Confirm the canonical target org and lowercase kebab-case ICP id before drafting when the evidence implies another altitude or ownership remains ambiguous.
5. Draft exactly one `<target-org>/icps/<icp-id>.md` with one H1 followed by `Identity`, `Account Profile`, `Fit Signals`, `Buying Context`, `Disqualifiers`, `Evidence And Confidence`, `Review Needs`, and `Open Questions` H2s in that order.
6. Record `Qualified label` as `<org-path>/<icp-id>` or the bare id at root, plus `Status` as `draft` for a new ICP or the preserved `working definition` for an existing one absent an explicit evidence-backed lifecycle decision.
7. Preserve supplied facts, evidence strength, uncertainties, open questions, and every unrelated existing section byte-identically.
8. Present one approval message containing the relative target path, purpose, no-external-side-effects statement, complete exact Markdown, and approval question.
9. Write exactly the approved bytes after explicit approval, creating only the target `icps/` directory when absent.
10. Stage only the owned ICP file with `git -C <repo-root>`.
11. Verify the staged diff with `git -C <repo-root>`.
12. Commit the completed artifact once without amending with `git -C <repo-root>`.
13. Pull with rebase when a remote exists, treating no remote as the legal commit-only case.
14. Push without force when a remote exists.
15. Summarize the position, qualified label, altitude decision, repo-relative sources, changed file, commit or skip status, preserved questions, and natural next step.

## Details

- Before drafting, emit `Sources read:` with the repo-relative root-to-target `org.md` chain, resolved person record, and every inherited or local visible ICP.
- After confirmation changes the target org, immediately echo `Working in <repo-name>/<confirmed-org-path> as <person>` before drafting.
- In the closing summary, repeat labeled fields for `Canonical position`, `Altitude rationale`, exact repo-relative `Sources`, changed file, commit or skip status, preserved questions, and next step.
- Form every canonical org path by joining only nested org ids and omitting the repo id plus every physical `suborgs/` segment; use that canonical path in confirmations, echoes, and qualified labels.
- Keep separate supplied facts independent unless a source explicitly relates them; do not turn role or ownership into an unstated ability, authority, participation, or evaluation criterion.
- Record every supplied named offer, package, or product association in the durable ICP, not only in approval or summary prose.
