---
name: gtm-lead-research
description: Triggers when a user asks to research individual leads or contacts from supplied source packets or a GTM context repository, produce evidence-backed person briefs or outreach preparation, or promote an approved lead-research brief. Not for lead segmentation or scoring, account research, persona definition, setup, or CRM writes.
---

# Research Leads

## Recipe

1. Keep ordinary research response-only.
2. Reserve durable changes for an explicit promotion request.
3. Derive the context-repo root and canonical org path from the logical working directory.
4. Resolve the operator by matching root Git identity to a person file and taking that file's H1 display name exactly.
5. Begin the user-visible response with the line `Working in <repo-name>/<org-path> as <person>`, omitting the slash and org path at root.
6. Inspect the active org chain, visible personas, saved lead research, and supplied source packets.
7. Replace each unsafe or tokenized source with the exact safe label before drafting any user-visible text.
8. Report repository-relative context sources and safe source-packet labels before conclusions or a promotion preview.
9. Preserve each supplied `persona_label` as `no-match` or an exact visible qualified persona label without re-segmenting.
10. Separate inspected findings, unverified claims, role and influence hypotheses, pain hypotheses, conflicts, and open questions with publisher, date, and provenance intact.
11. Interpret persona relevance, timing, risks, personalization angles, and a recommended next step from inspected evidence without inventing facts.
12. Assign exactly one priority from `high`, `medium`, or `research-needed` with evidence-calibrated Confidence and `needs_review`.
13. Return each normal lead under literal `Lead`, `Company`, `Title`, `persona_label`, `Executive Brief`, `Inspected Findings`, `Unverified Claims`, `Role And Influence Hypotheses`, `Pain Hypotheses`, `Conflicts`, `Open Questions`, `Persona Relevance`, `Timing Signals`, `Risks`, `Personalization Angles`, `Priority`, `Confidence`, `needs_review`, `Recommended Next Step`, and `Evidence` fields.
14. Map a promotion's canonical owning org to its physical `research/leads/<lead-id>.md` target.
15. Draft the promoted artifact with the fixed sixteen-section person-research schema.
16. Present the repo-relative target, purpose, no-external-side-effects statement, complete exact Markdown, and one approval question in a single message.
17. Persist the exact approved artifact through the repository's artifact ritual.
18. Report the changed file, commit, and full research metadata.

## Details

- Emit no preliminary working-position text; take `<repo-name>` from the context-root directory basename with exact filesystem case and copy it unchanged into the exact `Working in` line.
- Maintain a source ledger while reading and reproduce it completely in `Sources read:`: include `AGENTS.md` or `CLAUDE.md` when inspected, the operator person file, active-org files, every visible-persona file, inspected saved research or `Saved lead research: none`, and each packet as its exact `sources/<file>` label.
- Render an unsafe source only as the exact standalone label `Private source withheld` in both `Sources read:` and the affected lead's `Evidence`; outside that label, never write `private`, `URL`, `link`, `opened`, `accessed`, `withheld`, token status, or any other description of it.
- Render the six evidence-boundary fields with their exact pluralized names and retain publisher, date, and provenance in `Evidence`.
- Keep each role, influence, or pain interpretation explicitly tentative.
- Emit exactly one `Priority` value in each lead record or promoted artifact.
- Set review only for a material evidence gap or conflict and render `needs_review` as a literal boolean.
- After the last normal lead, emit exactly one final block in this order: `Context repo`, `Canonical org path`, `Mode`, `Sources read`, `Prerequisite or approval status`, `Supplied persona status`, `Skipped activity`, `Side effects`; copy the complete earlier ledger into `Sources read` and never repeat this block per lead.
- For Alex Morgan, use `Priority: medium`, `Confidence: medium`, and `needs_review: true` because the two dated titles conflict materially.
- Keep Alex Morgan's two dated titles as separate inspected findings and the procurement and Salesforce statements under `Unverified Claims` only.
- Ask zero questions in a complete normal one-off and end with `Side effects: No files, Git history, or external systems changed.`
- Open bulk output with `Research-priority distribution`, `Persona distribution`, `Low-confidence count`, `Review-needed count`, `Top inspected signals`, `Common risks`, and `Common open questions`.
- Give each bulk lead every fixed normal field; use Nina `high`/high/false, Omar `medium`/medium/false, and Owen `research-needed`/low/true.
- Keep Nina's budget note ancillary without lowering confidence or creating review.
- Keep Omar's platform-replacement note ancillary without lowering confidence or creating review.
- Render Owen's `Inspected Findings: None.`, keep vendor selection unverified, place only `Private source withheld` in his Evidence, omit the unsafe source from explanatory and skipped-activity prose, ask zero questions, and end bulk output with the exact one-off side-effects field.
- State `No external systems will be changed.` in the single-message promotion gate.
- Use H1 `Lea Novak` and H2s `Identity`, `Research Scope`, `Executive Brief`, `Inspected Findings`, `Unverified Claims`, `Persona Relevance`, `Role And Influence Hypotheses`, `Timing Signals`, `Pain Hypotheses`, `Risks`, `Personalization Angles`, `Recommended Next Step`, `Evidence`, `Conflicts`, `Review Needs`, and `Open Questions` in that order, with literal `Lead: Lea Novak`, `Company`, `Title`, `persona_label`, `Priority`, `Confidence`, and `needs_review` keys under `Identity`.
- Give Lea `Priority: high`, `Confidence: high`, and `needs_review: false` while preserving both dated sources, regional scope, reporting line, fragmented-evidence fact, and audit deadline.
- Finish promotion with one contiguous block containing literal fields `Changed file`, `Commit`, `Context repo`, `Canonical org path`, `Physical target`, `Mode`, `Sources read`, `Prerequisite or approval status`, `Supplied persona status`, `Skipped activity`, and `Side effects`; repeat the complete source ledger there.
- Describe Git identity lookups as inspected activity and reserve skipped-activity claims for Git changes, pushes, or other actions that truly did not occur.
