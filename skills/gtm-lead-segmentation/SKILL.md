---
name: gtm-lead-segmentation
description: Triggers when a user asks to classify, segment, route, bucket, or qualify individual leads or contacts against visible GTM personas.
---

# Segment Leads

## Recipe

1. Treat segmentation as response-only ephemeral work with no context-repo, Git, machine-state, or external-system changes.
2. Derive the repo root, canonical org position from cwd, and operator from root git identity, honoring an explicit org or operator for this invocation only and never treating the lead as the operator.
3. Read the root-to-target `org.md` chain and every inherited or local visible persona, resolving same-stem collisions by nearest-file precedence while retaining non-colliding inherited personas.
4. Render `Sources read:` as the first workflow content with repo-relative org and visible persona paths, identifying overridden same-stem paths separately.
5. Echo `Working in <repo-name>/<org-path> as <person>` before any preliminary or final classification, omitting the org suffix at root and the person clause when unresolved and unnecessary.
6. Normalize only the supplied lead, company, title, responsibility, scope, and employment facts without enrichment or invention.
7. Proceed without questions or approval gates when the inputs are complete.
8. Assign each lead exactly one visible qualified persona label or the literal `no-match`, prioritizing responsibilities and scope over title, applying explicit disqualifiers, and explaining why it wins over plausible visible alternatives.
9. Calibrate `Confidence` and `needs_review` only from lead-level evidence gaps or conflicts that could change the label.
10. Render one-off results with literal fields `Lead`, `Company`, `Title`, `Qualified label`, `Matched persona`, `Confidence`, `needs_review`, `Reasoning`, `Evidence`, `Disqualifiers considered`, and `Open questions`.
11. Render bulk results by starting with literal fields `Counts by qualified label`, `No-match count`, `Low-confidence count`, `Review-needed count`, `Common evidence`, and `Common open questions`, followed by every lead once using literal columns `Lead | Company | Title | Qualified label | Matched persona | Confidence | needs_review | Reasoning | Evidence | Disqualifiers considered | Open questions`.
12. Finish with literal metadata fields `Context repo`, `Canonical org path`, `Mode`, `Persona sources`, `Prerequisite/gap status`, `Skipped activity`, and `Side effects`, explicitly stating that no files, Git history, or external systems changed.

## Details

- Map physical `suborgs/<path>` directories to canonical `<path>` in the working line and metadata; emit the exact working line once without trailing punctuation.
- Copy the repository directory basename verbatim into `Context repo`.
- Render `Confidence` only as lowercase `high`, `medium`, or `low`, and `needs_review` only as the literal boolean `true` or `false`.
- Preserve each supplied unknown in `Open questions` even when it does not create label ambiguity.
- Emit exactly one complete `Sources read:` report; never emit a provisional source-progress line.
- Keep complete-input process narration and `Skipped activity` free of question, reply, interaction, gate, clarification, approval, or scripted-handling language.
- Name every plausible losing visible persona and its losing reason; report a same-stem overridden persona separately as excluded by precedence.
- Render the root metadata value exactly as `Canonical org path: root`.
- Complete source inspection before responding; put every required repo-relative path on the single `Sources read:` line instead of describing discovery.
- Contrast alternatives as unmet persona criteria without converting those criteria into supplied lead facts.
- State every supplied employment, responsibility, scope, and decision-relevant non-ownership fact in `Evidence` or `Reasoning`.
