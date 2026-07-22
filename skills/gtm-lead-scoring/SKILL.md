---
name: gtm-lead-scoring
description: Triggers when a user asks to score, rank, qualify, or prioritize individual leads against an existing GTM lead-scoring rubric.
---

# Score Leads

## Recipe

1. Resolve the supplied `$GTM_HOME/state.json` to project, canonical org path, and active person; never access or modify `~/.gtm`, state, context, Git, or external systems.
2. Validate each supplied `persona_label` as `no-match` or an exact visible qualified persona label; do not re-segment, enrich, research, or invent labels.
3. From the persona's owning org, walk toward root and use the nearest `lead-scoring.md`; if none exists, stop with a prerequisite report rather than inventing or writing a rubric.
4. Report the root-to-target org chain, persona source, and every considered scoring source, then emit `Working in <project>/<canonical-org-path> as <person-id>` before scoring.
5. Preserve supplied component ratings and missing inputs, map them to rubric points, show the addition, apply caps, and assign the exact rubric band.
6. Set confidence and `needs_review` from missing, conflicting, or invalid scoring inputs, not merely from a submaximal or single-signal component.
7. For one-off work, return lead, company, title, persona label, components, raw/final score, cap, band, confidence, review flag, positives, risks, action, reasoning, provenance, and open questions.
8. For bulk work, rank every lead, then recompute from final scores the band distribution, average, low-confidence and review counts, common risks, and common questions.
9. Return scoring only in the response; finish with project/org/mode/persona-source/rubric-source/prerequisite/skipped-activity/no-side-effects metadata.

## Details

- State's `person` is the active operator, never the lead being scored. Take the canonical org path directly from `state.projects[state.active].org`: an absent or empty value means root, otherwise use that value verbatim. Never derive the canonical path from filesystem directories and never include project or literal `suborgs/`. Thus org `emea` renders exactly `Working in <project>/emea as <person-id>`; root renders `Working in <project>/ as <person-id>` and metadata `root (empty)`.
- After any host-mandated one-sentence skill-use notice, begin workflow output immediately at `Sources read:` with no intervening progress narration. List every root-to-target `org.md`, exact matched persona file, overridden same-stem persona when present, and every considered rubric path relative to the context-repository root. Use full paths such as `personas/x.md` and `suborgs/emea/personas/x.md`, never bare filenames. Then emit the unquoted exact working line before any score, rank, band, count, or scoring conclusion; never preview arithmetic or outcomes first.
- Lead scoring has no interactive gate. With complete inputs, never mention a question, reply, gate, interaction, clarification, or whether one is needed. Ask only when a missing prerequisite makes scoring impossible.
- Score confidence means confidence that the supplied inputs support the computation. Complete valid inputs yield high confidence even when a component is submaximal; set review only for a missing, conflicting, or invalid input that could change the calculation.
- Apply guardrails literally: `no-match` always maps persona fit to the rubric's no-match points regardless of another supplied adjective, then apply its final-score cap. Preserve missing values, map them to the rubric's missing-input value, and flag them for review.
- Every one-off result uses literal fields `Lead`, `Company`, `Title`, `Persona label`, `Component mappings`, `Raw score`, `Final score`, `Cap`, `Band`, `Confidence`, `needs_review`, `Positives`, `Risks`, `Recommended action`, `Reasoning`, `Provenance`, and `Open questions`.
- Every bulk row repeats every one-off field with `Lead` explicit and keeps `Raw score` and `Final score` as separate labels; headings, combined `Raw/final score`, or prose do not satisfy those fields. Never calculate bulk totals mentally: use an available calculator or arithmetic tool on the completed final-score list, cross-check the sum against every displayed row, and show `sum of final scores / lead count = average`. Include literal `Band distribution`, `Average final score`, `Low-confidence count`, `Review-needed count`, `Common risks`, and `Common open questions`, even when the user asks for the summary before the rows.
- Every final metadata block uses all literal fields `Project`, `Canonical org path`, `Mode`, `Persona sources`, `Rubric sources`, `Prerequisite/gap status`, `Skipped activity`, and `No side effects`; provenance elsewhere never substitutes for a metadata field.
- When the host requires `transcript.md`, copy the actual complete final response under `## FINAL MESSAGE`; never replace it with a source report, working line, or reconstruction.
