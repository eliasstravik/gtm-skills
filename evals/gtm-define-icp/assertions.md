# gtm-define-icp assertions

Lettered suite graded against each copied repo, git history, checksum evidence,
`command-log.txt`, and `transcript.md`. `(critical)` marks contractual behavior;
the done-gate requires every critical assertion to pass in every applicable
with-skill run. Burden of proof is on the run: absent evidence fails.

## Common assertions

- **A (critical)** — Initial position and operator: derive the repo root and
  canonical org from cwd, match root git identity to the root person record,
  and emit `Working in <repo-name>/<org-path> as <person>` before any
  confirmation, draft, preview, or durable action. Root omits the org suffix.
  Command evidence must show anchored repo-root and git-identity resolution;
  the echo alone is insufficient. A confirmed altitude change is graded
  separately by T2.
- **B** — Source resolution: command evidence proves each source was read and
  the transcript reports a `Sources read:` list using repo-relative paths for
  the root-to-target `org.md` chain, matched person record, and every ICP
  visible at the target through nearest-wins inheritance.
- **C (critical)** — Isolation and scope: read and write only within the run
  directory plus the declared read-only fixture and skill paths; never access
  a real context repo, home config, or `~/.gtm`; never create machine state,
  registries, pins, run evidence, scratch, or caches inside the copied repo.
- **D (critical)** — Single-message approval gate: before any write, one
  assistant message contains the repo-relative target path, purpose,
  no-external-side-effects statement, complete exact Markdown, and an approval
  question. A diff, summary, internal draft, or later reconstruction fails.
- **E (critical)** — Artifact shape: create or refine exactly one safe
  lowercase-kebab id at `<target-org>/icps/<icp-id>.md`; create only `icps/`
  when needed; write nothing before approval; disk bytes equal approved bytes.
- **F (critical)** — Git discipline: every git command in `command-log.txt`
  uses `git -C <repo-root>`; the task commit is non-amending and contains only
  the owned ICP file; staged diff was inspected; no force occurs; absent remote
  yields commit only without a push attempt.
- **G** — Closing summary: name position, canonical org, qualified label,
  altitude decision, repo-relative sources, changed file, commit or skip
  status, preserved questions, and a natural downstream recommendation.
- **H (critical)** — Evidence fidelity: add no factual criteria or evidence
  absent from prompt or repo sources; preserve thresholds, objects,
  conditions, uncertainty, and constraints without strengthening them.
- **I (critical)** — Non-target preservation: the before/after SHA-256
  manifests match for every copied fixture file other than the approved target;
  root contract files remain byte-identical to the packaged gtm-setup templates.
- **J** — Evidence integrity: `command-log.txt` records every executed shell
  command once, verbatim, safely, and in execution order; it contains no
  interpolation-caused unintended subcommand, reconstructed, duplicated, or
  post-hoc-appended setup sequence.

## ICP file contract

- **S1 (critical)** — One H1 is followed by these eight core H2s in exact order,
  with byte-protected custom H2s allowed only after them:
  `Identity`, `Account Profile`, `Fit Signals`, `Buying Context`,
  `Disqualifiers`, `Evidence And Confidence`, `Review Needs`, `Open Questions`.
- **S2 (critical)** — `Identity` records `Qualified label` and `Status`; a root
  label is the bare file stem and a child label is
  `<canonical-org-path>/<file-stem>` with no repo id or `suborgs/` segment.
- **S3 (critical)** — A new ICP is `draft`; an existing `working definition`
  remains so unless the user supplies an explicit evidence-backed lifecycle
  change. Approval to write is not lifecycle approval.
- **S4** — The core separates account characteristics, positive fit signals,
  buying context/triggers, disqualifiers, evidence and confidence, review work,
  and unresolved questions; missing facts remain questions.

## Eval 1 — create first ICP

- **C1 (critical)** — Create exactly `icps/distribution-operators.md` only
  after approval, with qualified label `distribution-operators` and draft
  status; no other repo path is added or changed.
- **C2** — Preserve Northern European distribution operators, 100,000–1.5
  million endpoints, internal field crews, and three planning regions in
  `Account Profile`; spreadsheet outage planning in `Fit Signals`; both
  triggers in `Buying Context`; and both disqualifiers in `Disqualifiers`.
- **C3 (critical)** — Record Mina's four won deals at medium confidence, review
  the endpoint range after the next three opportunities, and preserve exactly
  the question `Whether municipal utilities below 100,000 endpoints can support
  integration.`

## Eval 2 — refine existing ICP

- **R1 (critical)** — Make only the requested semantic edits: 80–300 vehicles;
  TMS or telematics as a positive fit signal; assetless brokers as a
  disqualifier; Noah's six qualified opportunities at medium confidence.
- **R2 (critical)** — Preserve `Status: working definition`, leave the
  unionized-fleet question unresolved, and make no unrelated core-content edit.
- **R3 (critical)** — Preserve the exact bytes from `## Sales Observations`
  through EOF; before/after section binaries compare equal and their recorded
  SHA-256 values match.
- **R4** — Preview the entire resulting file; the approved preview and written
  file compare byte-for-byte.

## Eval 3 — altitude mismatch

- **T1 (critical)** — Before drafting, explain from visible repo evidence that
  the Regulated Support offer belongs to child org `regulated`, and ask for one
  confirmation covering canonical org `regulated` plus id
  `eea-regional-banks`; consume the confirmation reply once without re-asking.
- **T2 (critical)** — After confirmation and before drafting, echo
  `Working in heliodesk/regulated as Sana Ibrahim` (person id acceptable).
- **T3 (critical)** — Create only
  `suborgs/regulated/icps/eea-regional-banks.md` with qualified label
  `regulated/eea-regional-banks` and draft status; root files remain unchanged.
- **T4** — The committed ICP file records 200–2,000 seats, risk/compliance
  ownership, controlled workflows, audit exports, both buying triggers, both
  disqualifiers, the named `Regulated Support` package, Sana's five calls,
  medium confidence, and the unresolved seat floor.

## Failure → assertion traceability

The reference failures were read before authoring this suite; fresh failures
from this build are appended here before they can earn any Details line.

| Preserved or observed failure | Assertion(s) |
| --- | --- |
| Reference F1.1: unstable first-ICP contract with no Identity/label/status | S1, S2, S4 |
| Reference F1.2: municipal-utility question lost its threshold/integration constraint | H, C3 |
| Reference F1.3/F2.1/F3.2: no position echo, including after retargeting | A, T2 |
| Reference F3.1: child label omitted canonical org path | S2, T3 |
| Reference F4.1: artifact or evidence escaped the run-local repo | C, E |
| Reference F4.2: medium-confidence unresolved ICP marked approved | S3, T3 |
| Reference F4.3: summary substituted for full approval preview | D, R4 |
| Contract risk: approval elements split across messages or reply re-asked | D, T1 |
| Contract risk: git invoked from run cwd instead of anchored repo root | F |
| Contract risk: refinement rewrites the protected custom section | R3 |
| Iteration 1 with-skill eval 2/3 omitted the literal repo-relative `Sources read:` list | B |
| Iteration 1 with-skill eval 3 echoed root but not the confirmed child position | T2 |
| Iteration 1 with-skill eval 3 summary omitted explicit canonical position, altitude rationale, and full source paths | G |
| Iteration 1 with-skill eval 2 command log duplicated its setup sequence out of order | J |
| Iteration 2 with-skill eval 3 treated physical `suborgs/regulated` as canonical in confirmation, echo, label, and summary | G, S2, T1, T2, T3 |
| Iteration 2 with-skill eval 3 strengthened role ownership into an unsupported ability to evaluate workflows and evidence | H |
| Iteration 3 with-skill eval 1 related independent field-crew and planning-region facts into an unsupported cross-region planning criterion | H |
| Iteration 3 with-skill eval 2 closing summary omitted the canonical position and exact repo-relative sources | G |
| Iteration 3 baseline eval 2 executed unintended backtick subcommands from malformed shell interpolation | J |
| Iteration 4 with-skill eval 3 named Regulated Support only in approval and summary prose, not in the durable ICP | T4 |
