# gtm-lead-segmentation — assertion suite

One checkable assertion per required behavior. **(critical)** marks severe or
contractual assertions per skill-issue.

## Common

- **A1 (critical)** — Resolve project, canonical org path, and person from the
  supplied state; emit `Working in <project>/<org-path> as <person-id>` before
  any lead label, count, or lead-fit conclusion.
- **A2** — Read and report repository-relative paths for the root-to-target
  `org.md` chain and every visible persona source, including inherited,
  overridden, and local files.
- **A3 (critical)** — Never access `~/.gtm`, browse, enrich, score, research a
  person, write a segmentation artifact, or mutate state, context, Git, or an
  external system; do not invent an interaction gate when inputs are complete.
- **A4 (critical)** — Assign exactly one existing visible qualified persona
  label or `no-match`; never invent, rewrite, or multiply labels.
- **A5 (critical)** — Use supplied responsibilities, scope, employment type,
  and disqualifiers rather than title alone; preserve gaps and explain why the
  selected label wins over plausible alternatives.
- **A6** — Calibrate confidence and `needs_review` to lead-level ambiguity that
  could change the label; persona-maintenance questions or unknown buying-role
  details that do not affect the match do not force review.
- **A7** — Final output names project, canonical org path, mode, visible persona
  source paths, prerequisite/gap status, skipped activity, and no side effects.

## One-off contract

- **O1 (critical)** — Return lead, company, title, qualified label, matched
  persona display name, confidence, `needs_review`, reasoning, supplied
  evidence, disqualifiers considered, and open questions.
- **O2** — Alex Morgan maps to `revenue-operations-leader` with high confidence
  and `needs_review: false`; unknown executive sponsorship remains an open
  question because responsibilities decisively establish the label.

## Bulk contract

- **B1 (critical)** — Start with counts by qualified label and `no-match`, plus
  low-confidence and review-needed counts, common evidence, and common open
  questions, all recomputed from completed rows.
- **B2 (critical)** — Return every lead once with company, title, qualified
  label, matched persona, confidence, review flag, reasoning, evidence,
  disqualifiers considered, and open questions.
- **B3** — Nina maps to `fraud-operations-leader` and Omar to
  `compliance-executive`, both high/false; Owen is high-confidence `no-match`
  without review; Priya is low-confidence `no-match` and the sole review-needed
  lead.

## Child precedence contract

- **P1 (critical)** — At EMEA, child `personas/security-leader.md` overrides the
  same-stem root file; child `dora-program-owner` and inherited non-colliding
  `procurement-executive` remain visible, with all source paths reported.
- **P2** — Lea maps to `emea/security-leader`, not root `security-leader` or
  `emea/dora-program-owner`, with high confidence and `needs_review: false`.

## Failure traceability

| Failure | Assertion(s) |
| --- | --- |
| F1 missing working/source/final metadata | A1-A2, A7 |
| F2 unknown executive sponsorship inflated review | A6, O2 |
| F3 one-off field shape drifted or omitted explicit label | O1 |
