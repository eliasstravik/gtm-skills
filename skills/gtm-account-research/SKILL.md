---
name: gtm-account-research
description: Triggers when a user asks to research target accounts from supplied source packets or a GTM context repository, produce evidence-backed account briefs, or promote an approved account-research brief. Not for account segmentation or scoring, individual lead research, ICP or persona definition, setup, or CRM writes.
---

# Research Accounts

## Recipe

1. Keep ordinary research response-only.
2. Reserve durable changes for an explicit promotion request.
3. Derive the context-repo root and canonical org path from the logical working directory.
4. Resolve the operator by matching root Git identity to a person file and taking that file's H1 display name exactly.
5. Render the pre-conclusion line alone as `Working in <repo-name>/<org-path> as <person>`, omitting the slash and org path at root.
6. Inspect the active org chain, visible ICPs, saved account research, and supplied source packets.
7. Exclude unsafe or tokenized sources from opening, reproduction, and persistence under a safe source label.
8. Report repository-relative context sources and safe source-packet labels before conclusions or a promotion preview.
9. Separate inspected findings, unverified claims, pain hypotheses, buying-committee hypotheses, conflicts, and open questions with publisher, date, and provenance intact.
10. Interpret fit, timing, risks, personalization angles, and a recommended next step against the supplied segment and visible ICP without re-segmenting or inventing facts.
11. Assign exactly one priority from `high`, `medium`, or `research-needed` with evidence-calibrated Confidence and `needs_review`.
12. Return one-off or bulk research with fixed account fields, source metadata, and an explicit no-side-effects statement.
13. Map a promotion's canonical owning org to its physical `research/<account-id>.md` target.
14. Draft the promoted artifact with the fixed sixteen-section account-research schema.
15. Present the repo-relative target, purpose, no-external-side-effects statement, complete exact Markdown, and one approval question in a single message.
16. Persist the exact approved artifact through the repository's artifact ritual.
17. Report the changed file, commit, and full research metadata.

## Details

- Treat `<repo-name>` only as the case-sensitive repo-root directory basename and `<person>` only as the exact H1 of the Git-identity-matched person file; never retain `/` when the org path is empty.
- Render `Sources read:` before any conclusion or preview with every context path and supplied packet actually inspected or used, including inherited sources, using only `Private source withheld` for an unsafe source.
- Render the literal boundaries `Inspected Findings`, `Unverified Claims`, `Pain Hypotheses`, `Buying Committee Hypotheses`, `Conflicts`, and `Open Questions` for every account, preserving publisher, date, and supplied-packet provenance.
- Keep facts from separate sources separate unless one source explicitly joins them; never infer that unnamed markets, teams, or events are the named ones from another packet.
- Use `Confidence: medium` with `needs_review: true` for a material conflict or material unverified claim, `low`/`true` when no inspectable evidence exists, and `high`/`false` only when the decision evidence is complete and unconflicted.
- Give every account the literal fields `Account`, `Website`, `segment_label`, `Executive Brief`, all six evidence boundaries, `ICP Relevance`, `Timing Signals`, `Risks And Disqualifiers`, `Personalization Angles`, `Priority`, `Confidence`, `needs_review`, `Recommended Next Step`, and `Evidence`.
- Use `Priority: high` only for inspected fit plus a clear active or dated buying signal without material conflict, `medium` when useful fit or timing evidence has a material conflict or unverified dependency, and `research-needed` when no inspectable evidence exists.
- End normal research with `Side effects: No files, Git history, or external systems changed.` exactly.
- Open bulk output with `Research-priority distribution`, `Segment distribution`, `Low-confidence count`, `Review-needed count`, `Top inspected signals`, `Common risks`, and `Common open questions` before any account row.
- Give every bulk account its own complete fixed-field row, then report `Context repo`, `Canonical org path`, `Mode`, `Sources read`, `Prerequisite or approval status`, `Supplied segment status`, `Skipped activity`, and final `Side effects`.
- Represent an unsafe source only as `Private source withheld`; never add its host, path, query, token status, sanitized form, or descriptive parenthetical.
- State `No external systems will be changed.` verbatim in the single promotion-gate message.
- Draft promoted Markdown with H1 account name and exactly these H2s in order: `Identity`, `Research Scope`, `Executive Brief`, `Inspected Findings`, `Unverified Claims`, `ICP Relevance`, `Timing Signals`, `Pain Hypotheses`, `Buying Committee Hypotheses`, `Risks And Disqualifiers`, `Personalization Angles`, `Recommended Next Step`, `Evidence`, `Conflicts`, `Review Needs`, `Open Questions`.
- Put literal `Account`, `Website`, `segment_label`, `Priority`, `Confidence`, and `needs_review` keys inside the fixed promotion sections while preserving approximate values and cross-source boundaries exactly.
- Consume one approval reply without re-asking, write preview-identical bytes, stage only the target, verify its staged diff, make one non-amending commit, and push only when a remote exists; finish with literal `Changed file`, `Commit`, `Context repo`, `Canonical org path`, `Physical target`, `Mode`, `Sources read`, `Prerequisite or approval status`, `Supplied segment status`, `Skipped activity`, and `Side effects` fields.
