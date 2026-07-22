# gtm-account-scoring — assertion suite

One checkable assertion per required behavior. **(critical)** marks severe or
contractual assertions per skill-issue.

## Common

- **A1 (critical)** — Resolve project, canonical org path, and person from the
  supplied `$GTM_HOME/state.json`; emit
  `Working in <project>/<org-path> as <person-id>` before scoring.
- **A2** — Read and report the root-to-target `org.md` chain, the supplied
  segment's visible ICP source, and every considered `account-scoring.md` source.
- **A3 (critical)** — Never access `~/.gtm`; never modify state, context, Git,
  external systems, or persist a score/report artifact. Scoring is response-only.
- **A4 (critical)** — Accept only `no-match` or an exact visible qualified ICP
  label, use an existing governing rubric, and stop with a prerequisite report
  rather than inventing a label or rubric.
- **A5 (critical)** — Map components, add arithmetic, apply caps, choose bands,
  sort ranks, and recompute portfolio aggregates exactly from final scores.
- **A6** — Treat supplied component ratings as facts for this run; preserve them
  without re-segmentation, enrichment, or invented evidence.
- **A7** — Calibrate confidence and `needs_review` to missing, conflicting, or
  label-changing scoring inputs. A deliberately submaximal component or
  single-source evidence score does not itself require review.
- **A8** — Final output names project, canonical org path, mode, segment source,
  scoring source per record, prerequisites, and explicit no-side-effects status.

## One-off contract

- **O1 (critical)** — Return account, website, `segment_label`, component
  breakdown, raw and final score when a cap applies, exact band, confidence,
  `needs_review`, positives, risks, recommended action, reasoning, evidence,
  provenance, and open questions.
- **O2** — Helix Metals scores exactly `40 + 25 + 20 + 15 = 100`, band
  `top-priority`, high confidence, and `needs_review: false`, without inventing
  gaps that contradict the complete supplied component ratings.

## Bulk contract

- **B1 (critical)** — Start with band distribution, average final score,
  low-confidence count, review-needed count, common risks, and common questions.
- **B2 (critical)** — Rank every input account exactly once and include website,
  segment, component arithmetic, final score, band, confidence, review flag,
  reasoning, evidence, action, provenance, and open questions.
- **B3 (critical)** — Return NordPay 100/top-priority, Kestrel 71/priority,
  Silver Birch raw 40 capped to 39/no-fit, and Unknown Harbor 0/no-fit; average
  is 52.5 and only Unknown Harbor is low-confidence and review-needed.

## Child precedence contract

- **P1 (critical)** — Resolve scoring criteria from the supplied segment's org;
  the nearest `account-scoring.md` wins over inherited criteria.
- **P2 (critical)** — Report root and child scoring paths, select the EMEA child
  source, and return Baltic Ledger exactly `20 + 30 + 25 + 15 = 90`, `immediate`.

## Failure traceability

| Failure | Assertion(s) |
| --- | --- |
| F1 missing position/source/final metadata | A1-A2, A8, O1, B2 |
| F2 weak evidence mechanically triggered review | A7, B3 |
| F3 score report persisted despite ephemeral contract | A3 |
| F4 complete supplied ratings were contradicted by invented gaps | A6-A7, O2 |
| F5 portfolio average or no-match score/band was miscomputed | A5, B1, B3 |
| F6 unnecessary approval question delayed read-only scoring | A1, A6 |
