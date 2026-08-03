---
name: gtm-define-personas
description: Triggers when a user asks to create, define, or refine a buyer or stakeholder persona in a GTM context repository.
---

# Define a Persona

## Recipe

1. Derive the repo root, canonical org position from cwd, and operator from root git identity, honoring an explicit org or operator for this invocation only.
2. Echo `Working in <repo-name>/<org-path> as <person>` before acting, omitting the org suffix at root and the person clause when unresolved and unnecessary.
3. Read the root-to-target `org.md` chain, the resolved root `people/<id>/person.md`, and every inherited or local visible ICP and persona as repo-relative sources.
4. Infer the persona's owning altitude from the offer, visible ICPs, and evidence.
5. Confirm the canonical target org and lowercase kebab-case persona id before drafting when ownership differs from the current position or remains ambiguous.
6. Echo the corrected working position immediately after confirmation changes the target org.
7. Draft exactly one `<target-org>/personas/<persona-id>.md` with one H1 followed by `Identity`, `Titles And Responsibilities`, `Buying Role`, `Pains And Priorities`, `Objections And Disqualifiers`, `Outreach Hooks`, `ICP Relevance`, `Evidence And Confidence`, `Review Needs`, and `Open Questions` H2s in that order.
8. Record `Display name` and `Qualified label` as `<org-path>/<persona-id>` or the bare id at root under `Identity`.
9. Preserve supplied facts, evidence strength, uncertainties, open questions, and every unrelated existing section byte-identically.
10. Express bad-fit or no-match contacts as disqualifier guidance instead of creating a persona for them.
11. Present one approval message containing the relative target path, purpose, no-external-side-effects statement, complete exact Markdown, and approval question.
12. Write exactly the approved bytes after explicit approval, creating only the target `personas/` directory when absent.
13. Stage only the owned persona file with `git -C <repo-root>`.
14. Verify the staged diff with `git -C <repo-root>`.
15. Commit the completed artifact once without amending with `git -C <repo-root>`.
16. Synchronize without force when a remote exists, treating no remote as the legal commit-only case.
17. Summarize the position, qualified label, altitude decision, repo-relative sources, changed file, commit or skip status, preserved questions, and natural next step.

## Details

- Resolve and retain the physical root with `git -C <repo-root> rev-parse --show-toplevel`; emit the working-position line as an exact standalone literal without leading or trailing punctuation, using that root directory's lowercase basename rather than the display-name H1.
- Before drafting, emit `Sources read:` with the repo-relative root-to-target `org.md` chain, resolved person record, and every inherited or local visible ICP and persona.
- In the approval message, name the persona path relative to the repository root, including every physical `suborgs/<id>/` segment for a child target.
- Preserve the boundary between sourced responsibilities and buying authority; never infer sponsorship, pilot authority, participation, or product fit from a title, pain, or dependency.
- When ownership differs from the active org, explain the named offer and evidence alongside the owning org's exact visible qualified ICP label before requesting confirmation.
- After an altitude confirmation, immediately repeat the exact lowercase-basename working-position line before any draft or preview.
- Close with labeled fields for `Canonical position`, `Qualified persona label`, `Altitude decision`, repo-relative `Sources`, `Changed file`, `Commit status`, `Preserved open questions`, and `Next step`.
- Under `Identity`, make `Display name` the human-readable persona title derived from evidence or the id, never the lowercase kebab-case id itself.
