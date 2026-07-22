# gtm-account-segmentation — assertion suite

One checkable assertion per required behavior. **(critical)** marks severe or
contractual assertions per skill-issue.

## Common

- **A1 (critical)** — Resolve the active project, canonical org path, and person
  from the supplied `$GTM_HOME/state.json`; emit
  `Working in <project>/<org-path> as <person>` before classifying.
- **A2** — Read and report the root-to-target `org.md` chain and every ICP
  visible at the target, applying nearest-file precedence when stems collide.
- **A3 (critical)** — Operate only inside the supplied run-local `$GTM_HOME`;
  never access or modify `~/.gtm`, `state.json`, context files, or Git history,
  and perform no external side effects.
- **A4 (critical)** — Assign each account exactly one existing visible qualified
  ICP label or the literal `no-match`; never invent, shorten, or combine labels.
- **A5** — Use only supplied facts, preserve conflicts and gaps, and never
  enrich or invent evidence.
- **A6 (critical)** — Calibrate `confidence` and `needs_review` to account-level
  evidence completeness and ambiguity; do not mechanically turn an ICP's
  general review backlog into an account review requirement.
- **A7** — Final output names project, canonical org path, mode, visible ICP
  source paths, prerequisite or gap status, and explicit no-side-effects status.

## One-off contract

- **O1 (critical)** — Return account name, website, exactly one segment label,
  ICP display name when matched, confidence, `needs_review`, reasoning,
  evidence, and open questions.
- **O2** — Explain why the selected label wins over plausible visible
  alternatives without turning the result into multi-label classification.

## Bulk contract

- **B1 (critical)** — Start with counts by every emitted label, low-confidence
  count, review-needed count, common evidence patterns, and common open
  questions.
- **B2 (critical)** — Return every input account exactly once with website,
  one label, confidence, `needs_review`, reasoning, evidence, and open questions.
- **B3** — Route NordPay Bank to `regional-digital-banks`, Kestrel Commerce to
  `embedded-finance-platforms`, and Silver Birch Advisory plus Unknown Harbor
  to `no-match`; only Unknown Harbor is low-confidence and review-needed.

## Child precedence contract

- **P1 (critical)** — Treat the child `enterprise.md` as overriding the root
  same-stem file while retaining non-colliding inherited visibility.
- **P2 (critical)** — Assign Baltic Ledger exactly `emea/enterprise`, not
  `enterprise` or `mid-market`, and report both root and child source paths plus
  the precedence decision.

## Failure traceability

| Failure | Assertion(s) |
| --- | --- |
| F1 missing working position, source metadata, website, and explicit open-question field | A1-A2, A7, O1 |
| F2 mechanically promoted ICP review backlog into account review requirements | A6, B1, B3 |
| F3 incomplete child final omitted project/org/source metadata | A1-A2, A7, P2 |
| F4 transcript capture omitted the complete final response | A7, O1 |
