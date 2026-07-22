# gtm-define-icp — assertion suite

One checkable assertion per required behavior. **(critical)** marks severe or
contractual assertions per skill-issue.

## Common (all flows)

- **A1 (critical)** — Resolve the active project, canonical org path, and
  person from the supplied `$GTM_HOME/state.json`; before drafting, emit
  `Working in <project>/<org-path> as <person>` (person id or display name is
  acceptable; root may render with a trailing slash).
- **A2** — Read the project root `org.md`, each `org.md` on the root-to-target
  org chain, the resolved `person.md` when present, and every ICP visible from
  that target by inheritance; report the source files read.
- **A3 (critical)** — Write only inside the supplied run-local `$GTM_HOME` and
  only to the approved target ICP path; never access or modify `~/.gtm`, never
  write run evidence elsewhere, and never change `$GTM_HOME/state.json`.
- **A4 (critical)** — Before a durable change, show the target path, purpose,
  and complete exact Markdown file inline, state that no external side effects
  are planned, then ask for explicit approval; write nothing before approval.
- **A5 (critical)** — Create or modify exactly one per-org file at
  `<target-org>/icps/<icp-id>.md`; the id is lowercase kebab-case, cannot
  traverse directories, and the physical org path matches the confirmed
  content altitude.
- **A6** — After approval, the task commit contains only the target ICP file
  and is made in the context repo; do not amend unrelated history or push. If
  committing is unavailable or not approved, report that cleanly instead of
  widening scope.
- **A7** — Final response names project, canonical org path, qualified label,
  files read, file changed, commit or skip status, altitude decision, preserved
  open questions, and the natural downstream recommendation.
- **A8 (critical)** — Never invent factual qualification criteria or silently
  strengthen evidence. Preserve sourced uncertainties and constraints at equal
  or greater specificity; missing facts remain open questions.

## ICP file contract

- **S1 (critical)** — The file has one H1 followed by these stable H2 sections
  in order: `Identity`, `Account Profile`, `Fit Signals`, `Buying Context`,
  `Disqualifiers`, `Evidence And Confidence`, `Review Needs`, `Open Questions`.
  Existing human-authored sections after this core are preserved exactly unless
  the user explicitly asks to edit them.
- **S2 (critical)** — `Identity` records `Qualified label` and `Status`; a root
  ICP label is `<icp-id>`, while a child ICP label is
  `<canonical-org-path>/<icp-id>`.
- **S3 (critical)** — Medium-confidence evidence or any material unresolved
  validation need cannot be labeled `approved`; use `draft` for a new ICP and
  preserve `working definition` on an existing ICP unless the user explicitly
  supplies a different evidence-backed lifecycle decision. Approval to write a
  file is not approval of the ICP's validity.
- **S4** — The core sections clearly separate account characteristics, positive
  fit signals, buying triggers/context, disqualifiers, evidence source and
  confidence, planned reviews, and unresolved questions; absent content is
  written as an explicit open question, not omitted or fabricated.

## Create-first flow (eval 1)

- **C1 (critical)** — Create `icps/distribution-operators.md` only after the
  preview is approved; create the `icps/` directory if absent and no other
  files or directories.
- **C2** — The approved file faithfully records Northern European electricity
  distribution operators, 100,000–1.5 million endpoints, internal field
  crews, at least three planning regions, spreadsheet outage planning, both
  triggers, and both disqualifiers.
- **C3** — Evidence is Mina's review of four won deals at medium confidence;
  review the endpoint range after the next three opportunities; preserve the
  full inherited question about whether municipal utilities below 100,000
  endpoints can support integration.

## Refine-existing flow (eval 2)

- **R1 (critical)** — Change the fleet range to 80–300, add TMS or telematics
  as a positive fit signal, add assetless brokers as a disqualifier, and change
  the evidence to Noah's review of six qualified opportunities at medium
  confidence; do not make unrelated core-content edits.
- **R2 (critical)** — Preserve the complete `Sales Observations` section
  byte-for-byte and keep the unionized-fleet question unresolved.
- **R3** — Preview the entire resulting file, not a diff or field summary, and
  the written file exactly matches the approved preview.

## Altitude-mismatch flow (eval 3)

- **T1 (critical)** — Detect that Regulated Support is owned by the
  `regulated` child org rather than the active root; explain the evidence and
  obtain confirmation of canonical org path `regulated` and id
  `eea-regional-banks` before previewing or writing.
- **T2 (critical)** — Write only
  `suborgs/regulated/icps/eea-regional-banks.md`; qualified label is exactly
  `regulated/eea-regional-banks`; root files and active state remain unchanged.
- **T3** — Record the 200–2,000 seat range, risk/compliance ownership,
  controlled workflows, audit exports, both triggers, both disqualifiers,
  Regulated Support offer, Sana's five calls, medium confidence, draft status,
  and the unresolved minimum-seat validation question.

## Traceability — preserved failures to assertions

| Failure | Assertion(s) |
| --- | --- |
| F1.1 unstable first-ICP contract | S1, S2, S4 |
| F1.2 inherited question weakened | A8, C3 |
| F1.3 no create-flow position echo | A1 |
| F2.1 no refine-flow position echo | A1 |
| F3.1 child label omits org path | S2, T2 |
| F3.2 corrected altitude not echoed | A1, T1 |
| F4.1 output-path escape | A3, A5 |
| F4.2 unresolved ICP marked approved | S3, T3 |
| F4.3 summary substituted for full preview | A4, R3 |
