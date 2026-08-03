# gtm-lead-scoring — assertion suite

One checkable assertion covers each required behavior. **(critical)** marks contractual or severe behavior. Grading gives no partial credit; missing transcript or filesystem evidence fails the assertion.

## Common process and safety

- **A (critical)** — Derive the repo root and canonical org from the supplied cwd, removing physical `suborgs/` container segments so `suborgs/emea` becomes canonical `emea`, and resolve the fixture operator through root Git identity; define `<repo-name>` as the case-sensitive repository-root directory basename and `<person>` as the exact H1 display name from the matching `people/<id>/person.md`; before any message reveals or previews a Band judgment, emit exactly `Working in <repo-name> as <person>` at root or `Working in <repo-name>/<canonical-org-path> as <person>` at a child, with no trailing punctuation. The operator is never a scored lead.
- **B** — Emit `Visible persona sources:` with repo-relative paths for every visible persona after nearest same-stem resolution; identify overridden same-stem sources separately rather than presenting them as visible.
- **C (critical)** — Keep scoring response-only and ephemeral: do not modify any fixture byte, HEAD, Git history, index, worktree status, external system, or machine state; do not create a scoring file, rubric, or durable score artifact; never access `~/.gtm`, a real repo, or home config.
- **D (critical)** — Ask zero questions and introduce no approval, confirmation, prerequisite, or invented gate when the supplied inputs, labels, and visible persona context are complete.
- **E (critical)** — Validate and preserve each supplied `persona_label` exactly as an existing visible qualified persona label or literal `no-match`; never invent, shorten, combine, revise, or re-segment it.
- **F (critical)** — Use only qualitative judgment: no numeric score, points, weights, component scoring, formula, arithmetic, total, average, percentage, rubric file, or invented rubric.
- **G (critical)** — Assign each lead exactly one `Band` from the exact vocabulary `strong-fit`, `good-fit`, `weak-fit`, or `no-fit`.
- **H (critical)** — Ground each matched-label rationale in named content from that exact visible persona: cite matched responsibilities, pains, and buying-role content plus every hit disqualifier, and never use an overridden persona as a judgment basis.
- **I (critical)** — Calibrate `Confidence` (`high`, `medium`, or `low`), `needs_review`, and `Open questions` only to evidence gaps or conflicts for the lead; never inherit a persona’s `Evidence And Confidence`, `Review Needs`, or `Open Questions`; complete lead evidence produces no open question, while missing key lead facts produce `Confidence: low` and `needs_review: true`, never refusal.
- **J (critical)** — One-off rows use literal fields `Lead`, `Company`, `Title`, `persona_label`, `Band`, `Rationale`, `Matched Persona Content`, `Hit Disqualifiers`, `Confidence`, `needs_review`, `Evidence`, and `Open questions`; `needs_review` is the literal boolean `true` or `false`; metadata uses `Context repo`, `Canonical org path`, `Mode`, `Visible persona sources`, `Prerequisite or gap status`, and `Side effects`; `Side effects` explicitly states that no files, Git history, or external systems changed.
- **K** — Keep the command log chronological, verbatim, and safe; every Git inspection uses `git -C <repo-root>`, and the log corroborates the transcript plus unchanged manifests and Git state.

## One-off strong-fit contract

- **O1 (critical)** — Return Alex Morgan, ForgeOne, and `Director of Revenue Systems` exactly once with all twelve row fields and all six metadata fields; preserve `persona_label: revenue-operations-leader` and assign `Band: strong-fit`.
- **O2 (critical)** — Cite the exact matched persona content `Owns CRM architecture, lead routing, forecasting cadence, and revenue-process governance.`, `Operational and technical champion; executive sponsorship may sit elsewhere.`, and `Fragmented system ownership and inconsistent forecast operations.`, connect each to supplied evidence, and report no hit disqualifier.
- **O3 (critical)** — Set Alex Morgan `Confidence` to `high` and `needs_review` to `false`; keep the persona’s budget-authority review need and executive-sponsor open question separate from lead evidence gaps.

## Bulk all-bands contract

- **B1 (critical)** — Return Nina Karlsson / NordPay / Head of Fraud Operations / fraud-operations-leader, Omar Haddad / Beacon Bank / Chief Compliance Officer / compliance-executive, Owen Hart / Hart Advisory / Fraud Advisor / fraud-operations-leader, and Priya Shah / Kestrel / not supplied / no-match exactly once each with all twelve literal row fields.
- **B2 (critical)** — Assign Nina `strong-fit`, Omar `good-fit`, Owen `weak-fit`, and Priya `no-fit`, producing exactly one lead in each Band.
- **B3 (critical)** — For Nina, cite her persona’s responsibility, buying-role, and pain content; for Omar, cite compliance-policy/remediation ownership, executive sponsorship, and deadline accountability while treating known CFO budget ownership as an absent buying-role element rather than uncertainty; for Owen, name the exact `External advisor without internal operating authority.` disqualifier, cite the relevant workflow/pain content, and explicitly state that the hit caps the Band at `weak-fit`.
- **B4 (critical)** — Map Priya’s `no-match` directly to `no-fit` without reading a matched persona for her, re-segmenting her, manufacturing persona content, asking for missing facts, or refusing; set `Confidence: low`, `needs_review: true`, and preserve the missing title, employment, responsibility, scope, and buying-role facts as gaps.
- **B5 (critical)** — After all four rows and metadata through `Prerequisite or gap status`, render literal closing fields `Band distribution`, `Low-confidence count`, `Review-needed count`, `Common persona content`, `Common disqualifiers`, `Common open questions`, and final `Side effects`; distribution is one lead in each Band, both counts are one, Priya is the only low-confidence/review row, and `Side effects` is the final field.

## Child precedence contract

- **P1 (critical)** — At `emea`, replace root `personas/security-leader.md` with nearer `suborgs/emea/personas/security-leader.md`, retain inherited `personas/procurement-executive.md` and local `suborgs/emea/personas/dora-program-owner.md` as visible, and report the override plus all relevant repo-relative source paths.
- **P2 (critical)** — Preserve `persona_label: emea/security-leader`, use only `suborgs/emea/personas/security-leader.md` as the judgment basis, assign `Band: strong-fit`, and never use the root Security Leader or other visible persona content in the fit rationale.
- **P3 (critical)** — Cite the child persona content `Owns regional cloud-security controls, security engineering, and cloud-risk posture.`, `Regional operational and technical champion.`, and `Regional control coverage and security-engineering coordination.` with every supplied lead fact, report no hit disqualifier, and set `Confidence: high` with `needs_review: false` despite the child persona’s maintenance backlog.
- **P4 (critical)** — Return Lea Novak, Baltic Ledger, and `Director of Cloud Security, EMEA` exactly once with all twelve row fields and all six metadata fields.

## Failure-to-assertion traceability

| Known or anticipated failure | Assertion(s) |
| --- | --- |
| Band or fit conclusion leaks before the exact working line; operator confused with lead | A |
| Physical `suborgs/` directory segment leaks into canonical org metadata or the working line | A, P4 |
| Missing repo-relative sources or wrong child precedence | B, H, P1-P2 |
| File, Git, machine-state, external, scoring-file, or rubric side effect | C, J, K |
| Invented question, refusal, or approval gate despite sufficient judgment inputs | D, I, B4 |
| Fixed `Open questions` field is phrased as an interrogative assistant question | D, B4 |
| Persona label is revised or `no-match` is re-segmented | E, B4 |
| Numeric scoring, arithmetic, or rubric behavior returns | F |
| Wrong, formatted, or invented Band | G, O1, B2, P2 |
| Generic rationale omits persona responsibilities, pains, buying role, or disqualifier | H, O2, B3, P3 |
| Persona maintenance backlog becomes lead review; missing lead facts do not trigger review | I, O3, B4, P3 |
| Persona maintenance open question is copied into a complete lead result | I, O3, P3 |
| Missing fixed row, metadata, distribution, final no-effects field, or exact identities | J, O1, B1, B5, P4 |
