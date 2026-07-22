---
name: gtm-lead-research
description: Research individual leads or contacts from supplied source packets or an active GTM context, including person briefs, outreach preparation, buying-role hypotheses, personalization angles, and approved durable person-research promotion.
---

# Research Leads

## Recipe

1. Resolve the supplied `$GTM_HOME/state.json` to project, canonical org path, and active person; never access or modify `~/.gtm`.
2. Read and report the root-to-target `org.md` chain, every visible persona, relevant saved person research, and each allowed source packet.
3. Normalize lead identity, company, title, and supplied persona; accept only `no-match` or an exact visible qualified persona label without re-segmenting, scoring, or inventing facts.
4. Reject or safely label private, tokenized, local-only, or otherwise unsafe sources; inspect only allowed sources and obey any no-browse constraint.
5. Separate inspected findings, user-provided unverified claims, hypotheses, conflicts, and open questions; preserve source publisher, date, and provenance.
6. Interpret evidence against visible persona criteria: persona relevance, role/influence and pain hypotheses, timing, risks, personalization angles, priority, confidence, review flag, and next step.
7. For bulk work, return every lead once and start with priority/persona distributions, confidence/review counts, top inspected signals, common risks, and common questions.
8. Keep normal research response-only; finish with project/org/mode/sources/prerequisites/supplied-persona/skipped-activity/no-side-effects metadata.
9. For durable promotion, infer the persona-owning org and draft one `<target-org>/research/leads/<lead-id>.md` with one H1 and H2s in this order: `Identity`, `Research Scope`, `Executive Brief`, `Inspected Findings`, `Unverified Claims`, `Persona Relevance`, `Role And Influence Hypotheses`, `Timing Signals`, `Pain Hypotheses`, `Risks`, `Personalization Angles`, `Recommended Next Step`, `Evidence`, `Conflicts`, `Review Needs`, `Open Questions`.
10. Before promotion, show relative target, purpose, complete exact Markdown, and no-external-side-effects statement in one message and obtain explicit approval; then write exactly that file and commit only it without amend or push.

## Details

- State's `person` is the active operator, never the research subject and never a person-evidence conflict. Take canonical org directly from `state.projects[state.active].org`; root is empty and child ids exclude project and literal `suborgs/`.
- Before any conclusion or preview, emit `Sources read:` with every repository-relative root-to-target `org.md`, every visible persona path, relevant saved person-research paths or `none`, and every allowed source packet; then emit exactly `Working in <project>/<canonical-org-path> as <person-id>`, using `Working in <project>/ as <person-id>` at root.
- Priority measures the strength and immediacy of a person-linked research case. Use high for a current material initiative/deadline supported by enough inspected evidence, medium for a relevant future transition or one safe packet, and `research-needed` when there is no safe inspectable evidence; never rename the latter low, hold, or undetermined.
- Confidence measures evidence support, not certainty of budget authority: two consistent packets supporting identity, remit, and timing may yield high; one safe packet may yield medium; no safe evidence is low. `needs_review` is true for a material identity/title conflict, unsafe-source dependency, or gap blocking a reliable recommendation, not merely unknown budget/procurement or an ancillary unverified claim.
- Every one-off brief explicitly labels: lead, company, title, supplied persona, executive brief, inspected findings, unverified claims, conflicts, persona relevance, role/influence hypotheses, timing, pain hypotheses, risks, personalization angles, priority, confidence, `needs_review`, recommendation, provenance, and open questions.
- Every bulk lead repeats all one-off fields. Start the final result with literal priority/persona distributions, low-confidence and review-needed counts, top inspected signals, common risks, and common open questions; preserve publisher and published/retrieved dates in provenance.
- For promotion, the Markdown itself must include explicit priority, confidence, and `needs_review` values in the relevant sections. After approval, create the parent under the state-resolved context root, write the preview byte-for-byte, stage only the target, verify the staged diff, and make one non-amending local commit.
- Every final response uses literal metadata fields `Project`, `Canonical org path`, `Mode`, `Inspected source files`, `Prerequisite/approval status`, `Supplied persona status`, `Skipped activity`, and `Side effects`; completed promotion also names the exact changed file and commit.
- When the host requires `transcript.md`, preserve the complete user-visible exchange: source report, working line, exact preview, approval reply, and actual final response under `## FINAL MESSAGE`; the transcript is run evidence, not person research.
