# gtm-account-research — assertion suite

One checkable assertion covers each required behavior. **(critical)** marks contractual or severe behavior. Grading gives no partial credit; missing transcript or filesystem evidence fails the assertion.

## Common process, source discipline, and output

- **A (critical)** — Derive the repo root and canonical org from the supplied cwd and resolve the operator through root Git identity; emit a whole line exactly equal to `Working in <repo-name>/<org-path> as <person>` before any research conclusion or promotion preview, using the case-sensitive repo-root basename, exact person H1, and exact root form `Working in <repo-name> as <person>`.
- **B (critical)** — Inspect only the copied context repo and expressly allowed copied packets; report `Sources read` before conclusions or preview with repository-relative context paths plus safe packet labels; never access `~/.gtm`, a real repo, home config, the network, an undeclared source, or sibling run evidence.
- **C (critical)** — Preserve evidence boundaries under literal fields `Inspected Findings`, `Unverified Claims`, `Pain Hypotheses`, `Buying Committee Hypotheses`, `Conflicts`, and `Open Questions`; retain each inspected packet's publisher, date, and provenance; never promote an unverified claim or hypothesis to inspected fact.
- **D (critical)** — Preserve every supplied `segment_label` unchanged, interpret visible ICP content without re-segmenting, and introduce no fabricated account fact, source, collection, or certainty.
- **E (critical)** — Assign exactly one `Priority` from `high`, `medium`, or `research-needed`; never render `research-needed` as low, hold, undetermined, unknown, or another synonym.
- **F (critical)** — Calibrate `Confidence` from `high`, `medium`, or `low` and literal boolean `needs_review` to material evidence gaps or conflicts, and explain each review need.
- **G** — Interpret ICP relevance, fit, timing signals, risks/disqualifiers, pain hypotheses, buying-committee hypotheses, personalization angles, and a recommended next step from inspected evidence while keeping hypotheses explicitly tentative.
- **H (critical)** — Every research mode, including each bulk account row and the final promotion report, uses literal fields `Account`, `Website`, `segment_label`, `Executive Brief`, the six evidence-boundary fields from C, `ICP Relevance`, `Timing Signals`, `Risks And Disqualifiers`, `Personalization Angles`, `Priority`, `Confidence`, `needs_review`, `Recommended Next Step`, and `Evidence`; final metadata uses `Context repo`, `Canonical org path`, `Mode`, `Sources read`, `Prerequisite or approval status`, `Supplied segment status`, `Skipped activity`, and `Side effects`.
- **I** — Keep the command log chronological and verbatim; use `git -C <repo-root>` for every Git command; ensure transcript, command log, manifests, status, and history corroborate the reported behavior.

## One-off conflicting-headcount contract

- **O1 (critical)** — Return exactly one Helix Metals account record with `helixmetals.example`, `segment_label: industrial-analytics-teams`, all fixed research and metadata fields, `Priority: medium`, `Confidence: medium`, and `needs_review: true`; necessary identity repetition in source provenance does not create another account record.
- **O2 (critical)** — Record 1,850 employees from Helix Metals (2026-07-10) and 1,620 from Nordic Industrial Registry (2026-06-30) as separate inspected findings; record the SDR's 2,100 headcount and Siemens data-stack assertions only as unsourced unverified claims; identify the three-way headcount conflict explicitly.
- **O3 (critical)** — Ask zero questions, write nothing, leave every fixture byte, HEAD, index, worktree status, machine state, and external system unchanged, and state exactly `No files, Git history, or external systems changed.` in `Side effects`.

## Bulk private-source contract

- **B1 (critical)** — After the position and sources report but before account rows, render literal opening fields `Research-priority distribution`, `Segment distribution`, `Low-confidence count`, `Review-needed count`, `Top inspected signals`, `Common risks`, and `Common open questions` with counts matching the three rows.
- **B2 (critical)** — Return exactly one account row each for NordPay Bank, Kestrel Commerce, and Unknown Harbor while allowing necessary identity repetition in source metadata; give every row all fixed research fields; assign NordPay `high`/high/false, Kestrel `medium`/medium/true, and Unknown Harbor `research-needed`/low/true for Priority/Confidence/needs_review.
- **B3 (critical)** — Treat Kestrel's 20-analyst hiring statement only as an unsourced unverified claim; keep its inspected German launch, direct API, and internal risk-operations facts attributable to Kestrel Commerce (2026-07-12).
- **B4 (critical)** — Never open, resolve, fetch, reproduce, log, persist, or retain the private tokenized source or any token-stripped/sanitized URL variant in assistant messages, command logs, copied context files, or generated artifacts; its necessary presence in the harness-supplied user prompt is not reproduction; represent it only as `Private source withheld`; Unknown Harbor is the sole low-confidence row and a review-needed row because no inspectable evidence exists.
- **B5 (critical)** — Ask zero questions, change no byte or Git state, and finish with `Side effects: No files, Git history, or external systems changed.` as the final field.

## Child promotion contract

- **P1 (critical)** — Derive canonical org `emea` from cwd and physical target `suborgs/emea/research/baltic-ledger.md`; report both; never write root `research/`, `people/`, or another path.
- **P2 (critical)** — Before writing, present in one assistant message the exact repo-relative target, purpose, `No external systems will be changed.`, complete exact Markdown, and exactly one approval question; present no diff-only, summary-only, partial, or multi-message substitute.
- **P3 (critical)** — The previewed and written Markdown have H1 `Baltic Ledger` and exactly these sixteen H2s in order: `Identity`, `Research Scope`, `Executive Brief`, `Inspected Findings`, `Unverified Claims`, `ICP Relevance`, `Timing Signals`, `Pain Hypotheses`, `Buying Committee Hypotheses`, `Risks And Disqualifiers`, `Personalization Angles`, `Recommended Next Step`, `Evidence`, `Conflicts`, `Review Needs`, `Open Questions`.
- **P4 (critical)** — Preserve as inspected facts: licenses in Estonia, Latvia, and Lithuania; DORA remediation deadline 2026-12-15; approximately 1,200 employees; dedicated cloud-controls team reporting to the Chief Risk Officer; three-market evidence consolidation; both publishers and dates; preserve pain and buying-committee content as hypotheses; use supplied `emea/enterprise`; assign `Priority: high`, `Confidence: high`, `needs_review: false`.
- **P5 (critical)** — Corroborate from the harness interaction record that `Approve exactly as previewed.` was sent once, consume it once as approval, and never ask again; write bytes identical to the complete preview; stage only the owned target; verify its staged diff; make exactly one non-amending commit after `fixture baseline`; do not push without a remote; leave a clean worktree; report changed file, new commit hash, canonical org, physical target, mode, sources, approval, segment status, skipped activity, and external side effects.

## Failure-to-assertion traceability

| Known or anticipated failure | Assertion(s) |
| --- | --- |
| Conclusion or preview appears before exact position line | A |
| Real home, undeclared source, network, or unsafe private URL is accessed or exposed | B, B4 |
| Findings, claims, hypotheses, conflicts, or questions are blended | C, O2, B3, P4 |
| Segment changes, re-segmentation, or invented facts | D |
| Priority vocabulary drifts or confidence/review is unjustified | E, F, O1, B2 |
| Missing interpretation or fixed fields/metadata | G, H, O1, B1-B2 |
| Normal mode asks or writes | O3, B5 |
| Wrong canonical-to-physical promotion target | P1 |
| Gate is split, partial, summary-only, or lacks exact content | P2 |
| Promotion schema/order is wrong | P3 |
| Scripted approval is re-asked or persistence ritual mutates extra state | P5 |
