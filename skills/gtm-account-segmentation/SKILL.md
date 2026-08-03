---
name: gtm-account-segmentation
description: Triggers when a user asks to classify or segment accounts against visible ICPs in a GTM context repository.
---

# Segment Accounts

## Recipe

1. Treat segmentation as read-only ephemeral work with no context-repo or Git changes.
2. Derive the repo root, canonical org position from cwd, and operator from root git identity, honoring an explicit org or operator for this invocation only.
3. Read the root-to-target `org.md` chain and every inherited or local visible ICP, resolving same-stem collisions by nearest-file precedence while retaining non-colliding inherited ICPs.
4. Report `Sources read:` with repo-relative paths for the org chain and visible ICP files.
5. Echo `Working in <repo-name>/<org-path> as <person>` before any preliminary or final classification, omitting the org suffix at root and the person clause when unresolved and unnecessary.
6. Normalize only the supplied account facts without enrichment or invention.
7. Proceed without questions or approval gates when the inputs are complete.
8. Assign each account exactly one visible qualified ICP label or the literal `no-match`, explaining why it wins over plausible visible alternatives.
9. Render one-off results with literal fields `Account`, `Website`, `Segment label`, `Matched ICP`, `Confidence`, `needs_review`, `Reasoning`, `Evidence`, and `Open questions`.
10. Render bulk results by starting with literal fields `Counts by label`, `Low-confidence count`, `Review-needed count`, `Common evidence patterns`, and `Common open questions`, followed by every account once with all one-off fields.
11. Finish with literal metadata fields `Context repo`, `Canonical org path`, `Mode`, `Visible ICP sources`, `Prerequisite or gap status`, and `Side effects`, explicitly stating that no files, Git history, or external systems changed.

## Details

- Emit the exact unpunctuated working line before any message reveals or previews an account result.
- Derive `Confidence` and `needs_review` solely from account evidence gaps or conflicts, ignoring ICP maintenance backlogs.
- Use the selected ICP's display title for `Matched ICP`.
- Render `needs_review` only as the literal boolean `true` or `false`.
- Name plausible losing visible ICPs in `Reasoning` for every matched account.
- Report overridden same-stem paths separately from `Visible ICP sources`.
- Map physical `suborgs/<path>` directories to canonical org path `<path>` in the working line and metadata.
- Never use overridden same-stem ICP content as classification evidence or an alternative.
- State every supplied account fact and literal value in `Evidence` or `Reasoning`.
- Copy the repository directory basename verbatim into the working line and `Context repo`.
