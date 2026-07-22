# gtm-define-personas — assertion suite

One checkable assertion per required behavior. **(critical)** marks severe or
contractual assertions per skill-issue.

## Common

- **A1 (critical)** — Resolve project, canonical org path, and person from the
  supplied `$GTM_HOME/state.json`; after settling altitude and before drafting,
  emit `Working in <project>/<org-path> as <person>`.
- **A2** — Read and report the root-to-target `org.md` chain, resolved
  `person.md`, all visible inherited/local ICPs, and all visible inherited/local
  personas.
- **A3 (critical)** — Operate only inside the supplied run-local `$GTM_HOME`;
  never access or modify `~/.gtm` or `state.json`, and change only the approved
  persona path.
- **A4 (critical)** — Before writing, show one approval message containing the
  relative target path, purpose, no-external-side-effects statement, complete
  exact Markdown, and approval question; write nothing before approval.
- **A5 (critical)** — Create or modify exactly one safe lowercase-kebab persona
  file at `<target-org>/personas/<persona-id>.md`; physical placement matches
  the confirmed content altitude.
- **A6** — Commit only the approved persona file in the copied context repo;
  never amend or push, and report a genuine commit blocker without widening
  scope.
- **A7** — Final response names project, canonical org path, exact qualified
  persona label, source paths, changed file, commit or skip status, altitude
  decision, preserved open questions, and downstream recommendation.
- **A8 (critical)** — Preserve supplied facts, evidence strength, existing
  constraints, review needs, and inherited open questions without invention or
  loss of specificity; new-persona flows carry relevant inherited constraints,
  while exact refinements do not add unrelated inherited material.

## Persona file contract

- **S1 (critical)** — One H1 is followed by these H2 sections in order:
  `Identity`, `Titles And Responsibilities`, `Buying Role`,
  `Pains And Priorities`, `Objections And Disqualifiers`, `Outreach Hooks`,
  `ICP Relevance`, `Evidence And Confidence`, `Review Needs`, `Open Questions`.
  Existing human-authored sections after the core remain byte-for-byte unless
  the user explicitly asks to edit them.
- **S2 (critical)** — `Identity` records `Display name` and `Qualified label`;
  root labels are `<persona-id>`, child labels are
  `<canonical-org-path>/<persona-id>`, and ICP labels never become part of the
  persona label.
- **S3 (critical)** — Content remains lead-level: roles, titles,
  responsibilities, buying influence, pains, objections, disqualifiers, and
  outreach-safe hooks. Bad-fit or `no-match` contacts are guidance under
  disqualifiers, never a synthetic persona file.
- **S4** — `ICP Relevance` uses visible qualified ICP labels when known and
  clearly marks an unresolved future/dangling reference rather than inventing
  one.

## Create-first flow

- **C1 (critical)** — Create only
  `personas/network-operations-director.md` after approval, creating only its
  `personas/` directory if absent.
- **C2** — Record all supplied titles, responsibilities, buying influence,
  priorities, objection, safe hook, and bad-fit guidance in their proper
  sections; reference `municipal-water-utilities` exactly.
- **C3** — Record Lena's seven calls at medium confidence, review titles after
  five opportunities, and preserve verbatim the inherited asset-manager
  question.

## Refine-existing flow

- **R1 (critical)** — Make exactly four content changes: add VP of Fraud
  Operations, add analyst capacity planning, replace the objection with the
  supplied sentence, and change evidence to Omar's eight qualified
  opportunities at medium confidence.
- **R2 (critical)** — Preserve `Call Notes` byte-for-byte and keep the
  fewer-than-ten-analysts question unresolved.
- **R3** — Preview the entire resulting file, not a diff or summary, and write
  exactly the approved preview.

## Altitude-mismatch flow

- **T1 (critical)** — Explain that Caseworker Enablement and the local ICP make
  `public-sector` the owner; confirm canonical org path and persona id before
  previewing or writing.
- **T2 (critical)** — Write only
  `suborgs/public-sector/personas/benefits-program-director.md`; exact qualified
  label is `public-sector/benefits-program-director`.
- **T3** — Reference `public-sector/government-benefits-agencies` and record all
  supplied titles, role, approval dependency, priorities, objection, safe hook,
  disqualifier, evidence, confidence, and exact deputy-director question.

## Failure traceability

| Failure | Assertion(s) |
| --- | --- |
| F1.1/F4.3 unstable schema | S1-S4 |
| F1.2/F2.1 missing position and sources | A1-A2 |
| F1.3/F3.3 incomplete approval/final reports | A4, A7 |
| F2.2/F4.1 false commit handling | A3, A6 |
| F3.1 missing child path | S2, T2 |
| F3.2 corrected altitude not echoed | A1, T1 |
| F4.2 ICP inserted into persona label | S2, T2 |
