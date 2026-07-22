---
name: gtm-lead-segmentation
description: Triggers when a user asks to classify, segment, route, bucket, or qualify individual leads or contacts against visible GTM personas.
---

# Segment Leads

## Recipe

1. Resolve the supplied `$GTM_HOME/state.json` to project, canonical org path, and person; never access or modify `~/.gtm`, state, context, Git, or external systems.
2. Read and report the root-to-target `org.md` chain and every persona visible at the target; the nearest same-stem file overrides its inherited version while non-colliding personas remain visible.
3. Emit `Working in <project>/<canonical-org-path> as <person-id>` before any lead label, count, or lead-fit conclusion.
4. Normalize only supplied lead, company, title, responsibility, scope, and employment facts; do not browse, enrich, score, research the person, or invent evidence.
5. Assign exactly one existing visible qualified persona label or `no-match`; prioritize responsibilities and scope over title, apply explicit disqualifiers, preserve gaps, and explain plausible alternatives.
6. Set confidence and `needs_review` from lead-level ambiguity that could change the label, not persona-maintenance questions or unknown buying details irrelevant to the match.
7. For one-off work, return lead, company, title, qualified label, matched persona display name, confidence, review flag, reasoning, evidence, disqualifiers considered, and open questions.
8. For bulk work, return every lead once and start with label/no-match, low-confidence, and review counts plus common evidence and common questions, recomputed from completed rows.
9. Return segmentation only in the response; finish with project/org/mode/persona-source/prerequisite/skipped-activity/no-side-effects metadata.

## Details

- State's `person` is the active operator, never the lead being segmented. Canonical root is empty: render exactly `Working in <project>/ as <person-id>` and never put `root` or `root (empty)` inside that line; report metadata org as `root (empty)`. Child paths contain only nested org ids and exclude project and literal `suborgs/`.
- Before any lead label, count, or lead-fit conclusion, emit one `Sources read:` report with every path relative to the context-repository root: use `org.md`, `personas/x.md`, and `suborgs/emea/personas/y.md`, never `<project>/...`. Identify overridden paths separately; then emit the exact working line once. Final persona-source metadata repeats the exact visible paths, not display names or a generic directory.
- Lead segmentation has no interactive gate. With complete inputs, begin user-visible workflow output directly at `Sources read:`; do not preface it by announcing, asking, or consuming a question. Ask only when a missing input makes the requested decision impossible; empty scripted replies never imply a required question.
- In bulk, derive common evidence and common questions from completed rows. Report shared patterns such as internal operating ownership or explicit disqualifiers when present; use `none` only when no pattern actually recurs.
- Label final metadata exactly `Prerequisite/gap status:` and state both whether visible personas were available and whether supplied lead evidence had decision-relevant gaps.
- For complete-input runs, never mention a question, reply, interaction, gate, clarification, or scripted-reply handling in process narration. After any platform-mandated one-sentence skill-use notice, the next user-visible content is `Sources read:`.
- In every one-off result, including child precedence, use these literal top-level fields: `Lead`, `Company`, `Title`, `Qualified label`, `Matched persona`, `Confidence`, `needs_review`, `Reasoning`, `Evidence`, `Disqualifiers considered`, `Open questions`. Never leave the first three only in prose or evidence; cite employment type and every decision-relevant responsibility/scope fact.
- Every bulk row uses these literal columns: `Lead | Company | Title | Qualified label | Matched persona | Confidence | needs_review | Reasoning | Evidence | Disqualifiers considered | Open questions`. Do not collapse the last four fields into reasoning, and compare each selected label with every plausible visible alternative.
- Every final metadata block uses literal fields `Project`, `Canonical org path`, `Mode`, `Persona sources`, `Prerequisite/gap status`, `Skipped activity`, and `No side effects`; bulk summary or row content never substitutes for them.
- When the host requires `transcript.md`, copy every user-facing message verbatim and put the actual complete final response under `## FINAL MESSAGE`; never reconstruct, shorten, or replace the final after responding. The required transcript is run evidence, not a segmentation artifact.
