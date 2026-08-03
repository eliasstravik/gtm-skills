# gtm-account-scoring — assertion suite

One checkable assertion covers each required behavior. **(critical)** marks contractual or severe behavior. Grading gives no partial credit; missing transcript or filesystem evidence fails the assertion.

## Common process and safety

- **A (critical)** — Derive the repo root and canonical org from the supplied cwd and resolve the fixture operator through root Git identity; define `<repo-name>` as the case-sensitive repository-root directory basename and `<person>` as the exact H1 display name from the matching `people/<id>/person.md`; emit a whole line exactly equal to `Working in <repo-name>/<org-path> as <person>` before any message reveals or previews a Band judgment, with no trailing punctuation or extra prose; at root remove both the slash and empty org path so the form is exactly `Working in <repo-name> as <person>`. Generic non-result context-inspection progress is allowed before the line.
- **B** — Emit `Visible ICP sources:` with repo-relative paths for every visible ICP after nearest same-stem resolution; identify overridden same-stem sources separately rather than presenting them as visible.
- **C (critical)** — Keep scoring response-only and ephemeral: do not modify any fixture byte, HEAD, Git history, index, worktree status, external system, or machine state; do not create a scoring file, rubric, or durable score artifact; never access `~/.gtm`, a real repo, or home config.
- **D (critical)** — Ask zero questions and introduce no approval, confirmation, prerequisite, or invented gate when the supplied inputs, labels, and visible ICP context are complete.
- **E (critical)** — Validate and preserve each supplied `segment_label` exactly as an existing visible qualified ICP label or literal `no-match`; never invent, shorten, combine, revise, or re-segment it.
- **F (critical)** — Use only qualitative judgment: no numeric score, points, weights, component scoring, formula, arithmetic, total, average, percentage, rubric file, or invented rubric.
- **G (critical)** — Assign each account exactly one `Band` from the exact vocabulary `strong-fit`, `good-fit`, `weak-fit`, or `no-fit`.
- **H (critical)** — Ground each matched-label rationale in named content from that exact visible ICP: name matched Fit Signals and every hit Disqualifier, and never use an overridden ICP as a judgment basis.
- **I (critical)** — Calibrate `Confidence` (`high`, `medium`, or `low`) and `needs_review` only to evidence gaps or conflicts for the account; never inherit an ICP’s `Evidence And Confidence`, `Review Needs`, or `Open Questions` as an account-level gap.
- **J (critical)** — One-off rows use literal fields `Account`, `Website`, `segment_label`, `Band`, `Rationale`, `Matched Fit Signals`, `Hit Disqualifiers`, `Confidence`, `needs_review`, `Evidence`, and `Open questions`; `needs_review` is the literal boolean `true` or `false`; metadata uses `Context repo`, `Canonical org path`, `Mode`, `Visible ICP sources`, `Prerequisite or gap status`, and `Side effects`; `Side effects` explicitly states that no files, Git history, or external systems changed.
- **K** — Keep the command log chronological, verbatim, and safe; every Git inspection uses `git -C <repo-root>`, and the log corroborates the transcript plus unchanged manifests and Git state.

## One-off strong-fit contract

- **O1 (critical)** — Return Helix Metals and `helixmetals.example` exactly once with all eleven row fields and all six metadata fields; preserve `segment_label: industrial-analytics-teams` and assign `Band: strong-fit`.
- **O2 (critical)** — Name all three exact matched Fit Signals — `Internal analytics ownership`, `Cloud plant-data foundation`, and `Multi-site standardization urgency` — cite their supplied account evidence, and report no hit disqualifier.
- **O3 (critical)** — Set Helix Metals `Confidence` to `high` and `needs_review` to `false`; keep the ICP’s Snowflake proxy review note separate from account evidence gaps.

## Bulk all-bands contract

- **B1 (critical)** — Return NordPay Bank, Kestrel Commerce, Silver Birch Bank, and Unknown Harbor exactly once each with the supplied website, unchanged segment_label, and all eleven literal row fields.
- **B2 (critical)** — Assign NordPay Bank `strong-fit`, Kestrel Commerce `good-fit`, Silver Birch Bank `weak-fit`, and Unknown Harbor `no-fit`, producing exactly one account in each Band.
- **B3 (critical)** — For NordPay, name `Operating-license fit`, `Internal fraud ownership`, and `Migration backlog urgency`; for Kestrel, name `Owned embedded product` and `Direct API` while accurately treating dedicated ownership and active launch as absent rather than fabricated; for Silver Birch, name its otherwise strong matched signals and the exact `Outsourced investigation ownership` disqualifier, explicitly stating that this hit caps the Band at `weak-fit`.
- **B4 (critical)** — Map Unknown Harbor’s `no-match` directly to `no-fit` without reading a matched ICP for it, re-segmenting it, or manufacturing fit signals or disqualifiers.
- **B5 (critical)** — After all four rows and the metadata through `Prerequisite or gap status`, render literal closing fields `Band distribution`, `Low-confidence count`, `Review-needed count`, `Common fit signals`, `Common disqualifiers`, `Common open questions`, and final `Side effects`; distribution is one account in each Band, both counts are zero, all four rows are `Confidence: high` and `needs_review: false`, and `Side effects` is the final field.

## Child precedence contract

- **P1 (critical)** — At `emea`, replace root `icps/enterprise.md` with nearer `suborgs/emea/icps/enterprise.md`, retain non-colliding root `icps/mid-market.md` as visible, and report the override plus all relevant repo-relative source paths.
- **P2 (critical)** — Preserve `segment_label: emea/enterprise`, use only `suborgs/emea/icps/enterprise.md` as the judgment basis, assign `Band: strong-fit`, and never use the root enterprise ICP’s content in the rationale.
- **P3 (critical)** — Name all three child Fit Signals — `Dedicated controls ownership`, `DORA remediation urgency`, and `Multi-country EEA operations` — with the supplied evidence, report no hit disqualifier, and set `Confidence: high` with `needs_review: false` despite the child ICP’s maintenance backlog.
- **P4 (critical)** — Return Baltic Ledger and `balticledger.example` exactly once with all eleven row fields and all six metadata fields.

## Failure-to-assertion traceability

| Known or anticipated failure | Assertion(s) |
| --- | --- |
| Band or classification leaks before the exact working line | A |
| Missing repo-relative sources or wrong child precedence | B, H, P1-P2 |
| File, Git, machine-state, external, scoring-file, or rubric side effect | C, J, K |
| Invented question or approval gate despite complete inputs | D |
| Segment label is revised or `no-match` is re-segmented | E, B4 |
| Numeric scoring, arithmetic, or rubric behavior returns | F |
| Wrong or invented Band | G, O1, B2, P2 |
| Generic rationale omits named signals or disqualifier | H, O2, B3, P3 |
| ICP maintenance backlog becomes account review | I, O3, B5, P3 |
| Missing fixed row, metadata, distribution, final no-effects field, or exact child account identity | J, O1, B1, B5, P4 |
