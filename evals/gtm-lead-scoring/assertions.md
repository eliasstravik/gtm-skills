# gtm-lead-scoring — assertion suite

One checkable assertion per required behavior. **(critical)** marks severe or
contractual assertions per skill-issue.

## Common

- **A1 (critical)** — Resolve project, canonical org path, and active person
  from supplied state; emit `Working in <project>/<org-path> as <person-id>`
  before any lead score, rank, band, count, or scoring conclusion.
- **A2** — Read and report repository-relative root-to-target `org.md` paths,
  the exact persona source for matched labels, and every considered
  `lead-scoring.md` source.
- **A3 (critical)** — Never access `~/.gtm`, browse, enrich, research or
  re-segment a lead, define a rubric, invent an interaction gate, write a score
  artifact, or mutate state, context, Git, or an external system.
- **A4 (critical)** — Accept only `no-match` or an exact visible qualified
  persona label; preserve it without invention or re-segmentation.
- **A5 (critical)** — Select the nearest existing lead rubric from the persona's
  owning org toward root, map supplied components exactly, show addition, apply
  caps, and assign the exact band; stop rather than inventing a missing rubric.
- **A6 (critical)** — Preserve every supplied component rating and missing input
  without inventing contrary evidence or changing the persona label.
- **A7** — Set confidence and `needs_review` from missing, conflicting, or
  invalid scoring inputs, not merely a submaximal or single-signal component.
- **A8** — Final output names project, canonical org path, mode, persona/rubric
  sources, prerequisite/gap status, skipped activity, and no side effects.

## One-off contract

- **O1 (critical)** — Return lead, company, title, persona label, component
  mappings, raw/final score, cap, band, confidence, `needs_review`, positives,
  risks, action, reasoning, provenance, and open questions.
- **O2** — Alex scores 40 + 20 + 20 + 15 = 95, no cap, hot, high confidence,
  and `needs_review: false`.

## Bulk contract

- **B1 (critical)** — Start with band distribution, average final score,
  low-confidence and review-needed counts, common risks, and common open
  questions, recomputed from completed final rows.
- **B2 (critical)** — Rank every lead once with company, title, persona label,
  component mappings, raw/final score, cap, band, confidence, review flag,
  positives, risks, action, reasoning, provenance, and open questions.
- **B3** — Nina is 95/hot, Omar 85/hot, Priya 55/qualified and the sole
  low-confidence/review lead, Owen raw 45 capped to 24/deprioritize; average is
  64.75 and distribution is hot 2, qualified 1, nurture 0, deprioritize 1.

## Child precedence contract

- **P1 (critical)** — For `emea/security-leader`, consider root and EMEA rubric
  paths and select `suborgs/emea/lead-scoring.md` as nearest; report the child
  persona source and overridden root persona source.
- **P2** — Lea scores 25 + 25 + 35 + 10 = 95, no cap, immediate, high
  confidence, and `needs_review: false`.

## Failure traceability

| Failure | Assertion(s) |
| --- | --- |
| F1 missing working/source/final metadata | A1-A2, A8 |
| F2 bulk distribution contradicted completed scores | B1, B3 |
| F3 compact bulk rows omitted required fields | B2 |
| F4 child considered-source and persona precedence reporting drifted | A2, P1 |
