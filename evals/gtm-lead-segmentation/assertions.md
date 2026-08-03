# gtm-lead-segmentation — assertion suite

One checkable assertion covers each required behavior. **(critical)** marks contractual or severe behavior. Grading gives no partial credit; missing transcript or filesystem evidence fails the assertion.

## Common process and safety

- **A (critical)** — Derive the repo root and canonical org from the supplied cwd and resolve the fixture operator through root Git identity; before any message reveals or previews a lead result, emit exactly `Working in <repo-name> as <person>` at root or `Working in <repo-name>/<org-path> as <person>` at a child, with no trailing punctuation. The root form has no slash. The operator is never a segmented lead.
- **B (critical)** — After any platform skill-use notice, emit exactly one consolidated `Sources read:` report as the first workflow content; include repo-relative paths for the complete root-to-target `org.md` chain and every visible persona source after nearest-stem resolution, identify overridden same-stem sources separately, and never emit a provisional source-progress line.
- **C (critical)** — Keep segmentation response-only and ephemeral: do not modify any fixture byte, HEAD, Git history, index, worktree status, external system, or machine state, and never access `~/.gtm`, a real repo, or home config.
- **D (critical)** — Ask zero questions and introduce no approval, confirmation, prerequisite, or invented gate when the supplied inputs and visible persona context are complete; outside the required `Open questions` result field, do not narrate question, reply, interaction, gate, clarification, approval, or scripted-reply handling, including in `Skipped activity`.
- **E (critical)** — Assign each lead exactly one existing visible qualified persona label or the literal `no-match`; never invent, shorten, combine, or return multiple labels.
- **F** — Use only supplied lead facts and visible repo context, preserve evidence gaps and conflicts, and never browse, enrich from model memory, or claim nonexistent collections or facts.
- **G (critical)** — Prioritize supplied responsibilities and scope over title, apply explicit disqualifiers, and calibrate `Confidence` and `needs_review` only to evidence gaps or conflicts for that lead; never inherit a persona’s maintenance backlog as a lead-level gap.
- **H** — Explain why the selected label wins over every plausible visible alternative while retaining exactly one classification.
- **I (critical)** — End with literal metadata fields `Context repo`, `Canonical org path`, `Mode`, `Persona sources`, `Prerequisite/gap status`, `Skipped activity`, and `Side effects`; values must be accurate, `Context repo` must copy the repository directory basename verbatim, the canonical path must be `root` at root or omit physical `suborgs/` segments at a child, and `Side effects` must explicitly state that no files, Git history, or external systems changed.
- **J** — Keep the command log chronological, verbatim, and safe; any Git inspection uses `git -C <repo-root>`, and the log corroborates the transcript plus unchanged manifests and Git state.

## One-off responsibility contract

- **O1 (critical)** — Return literal fields `Lead`, `Company`, `Title`, `Qualified label`, `Matched persona`, `Confidence`, `needs_review`, `Reasoning`, `Evidence`, `Disqualifiers considered`, and `Open questions`, each exactly once for Alex Morgan; preserve exact values `Company: ForgeOne` and `Title: Director of Revenue Systems`.
- **O2 (critical)** — Assign Alex Morgan exactly `revenue-operations-leader`, name the persona display title, cite internal employment plus CRM architecture, lead routing, and forecasting cadence, and explain why `sales-operations-manager` loses despite the supplied title.
- **O3 (critical)** — Set Alex Morgan `Confidence` to `high` and `needs_review` to `false`; retain unknown executive sponsorship as an open question without turning it or the persona’s maintenance backlog into label ambiguity.

## Bulk contract

- **B1 (critical)** — Before any lead row, render literal summary fields `Counts by qualified label`, `No-match count`, `Low-confidence count`, `Review-needed count`, `Common evidence`, and `Common open questions`; derive the two common summaries from completed rows without fabricating a shared pattern.
- **B2 (critical)** — Return Nina Karlsson / NordPay / Head of Fraud Operations / Fraud Operations Leader, Omar Haddad / Beacon Bank / Chief Compliance Officer / Compliance Executive, Owen Hart / Hart Advisory / Fraud Advisor / no-match, and Priya Shah / Kestrel / VP Risk / no-match exactly once each using literal columns `Lead | Company | Title | Qualified label | Matched persona | Confidence | needs_review | Reasoning | Evidence | Disqualifiers considered | Open questions`.
- **B3 (critical)** — Assign Nina exactly `fraud-operations-leader`, Omar exactly `compliance-executive`, and both Owen and Priya exactly `no-match`.
- **B4 (critical)** — Report one `fraud-operations-leader`, one `compliance-executive`, and two `no-match`, with `No-match count: 2`, `Low-confidence count: 1`, and `Review-needed count: 1`, recomputed from completed rows.
- **B5 (critical)** — Make Priya the only `low`-confidence and `needs_review: true` row; make Owen a high-confidence `no-match` with `needs_review: false` because supplied external-advisor facts hit the visible disqualifier; do not turn persona maintenance backlogs into lead review.

## Child precedence contract

- **P1 (critical)** — At `emea`, replace root `personas/security-leader.md` with nearer `suborgs/emea/personas/security-leader.md`, retain inherited `personas/procurement-executive.md` and local `suborgs/emea/personas/dora-program-owner.md` as visible, and report the override decision and all relevant repo-relative source paths.
- **P2 (critical)** — Assign Lea Novak exactly `emea/security-leader`, never root `security-leader`, `emea/dora-program-owner`, `procurement-executive`, a combined label, or `no-match`; explicitly explain that DORA Program Owner loses on supplied non-ownership, Procurement Executive loses for lack of procurement authority, and root Security Leader is excluded by the child same-stem override.
- **P3 (critical)** — Render literal `Confidence: high` and `needs_review: false` for Lea, citing internal employment and all supplied regional security-control, engineering, risk-posture, and non-ownership facts while keeping persona maintenance backlogs separate.
- **P4 (critical)** — Return literal fields `Lead`, `Company`, `Title`, `Qualified label`, `Matched persona`, `Confidence`, `needs_review`, `Reasoning`, `Evidence`, `Disqualifiers considered`, and `Open questions`, each exactly once for Lea Novak; preserve exact values `Company: Baltic Ledger`, `Title: Director of Cloud Security, EMEA`, and `Matched persona: EMEA Security Leader`.

## Failure-to-assertion traceability

| Known or anticipated failure | Assertion(s) |
| --- | --- |
| Workflow preface before sources or classification before working line | A, B, B1 |
| Duplicate/provisional source report or interaction narration | B, D |
| Operator confused with the segmented lead | A, O1, B2, P2 |
| Missing repo-relative sources or child precedence details | B, I, P1-P2 |
| Invented question or approval gate despite complete inputs | D |
| Forced least-bad, title-only, shortened, combined, or invisible label | E, G-H, B3, P2 |
| Persona maintenance backlog becomes lead review | G, O3, B4-B5, P3 |
| Missing fixed field, bulk row, column, summary, or metadata | I, O1, B1-B2 |
| Child one-off fields or literal confidence values drift | P3-P4 |
| Browse/enrichment or nonexistent context claim | F |
| Any file, Git, machine-state, or external side effect | C, I, J |
