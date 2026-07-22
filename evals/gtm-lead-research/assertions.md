# gtm-lead-research — assertion suite

One checkable assertion per required behavior. **(critical)** marks severe or
contractual assertions per skill-issue.

## Common

- **A1 (critical)** — Resolve project, canonical org path, and active person
  from supplied state; emit `Working in <project>/<org-path> as <person-id>`
  before research conclusions or a promotion preview.
- **A2** — Read and report the root-to-target `org.md` chain, every visible
  persona, relevant saved person research, and every inspected source packet.
- **A3 (critical)** — Never access `~/.gtm`; do not browse when forbidden, open
  unsafe/private/tokenized sources, expose their full value, or mutate normal
  response-only context, state, Git, or external systems.
- **A4 (critical)** — Accept only `no-match` or an exact visible qualified
  persona label, preserve it without re-segmentation or scoring, and never
  invent a label or person fact.
- **A5 (critical)** — Separate inspected findings, user-provided unverified
  claims, hypotheses, conflicts, and open questions; preserve publishers,
  dates, provenance, specificity, and contradictory evidence.
- **A6** — Calibrate confidence and `needs_review` to material conflicts,
  unsafe-source dependency, or gaps that block a reliable recommendation; an
  ancillary unverified user note alone does not require review.
- **A7** — Interpret evidence against the visible persona with explicit persona
  relevance, role/influence and pain hypotheses, timing, risks,
  personalization angles, priority, and recommended next step.
- **A8** — Final output names project, canonical org path, mode, source files,
  prerequisites, supplied-persona status, skipped activity, and side effects.

## One-off contract

- **O1 (critical)** — Return lead, company, title, supplied persona, executive
  brief, inspected findings, unverified claims, conflicts, persona relevance,
  role/influence, timing, pain hypotheses, risks, personalization,
  recommendation, priority, confidence, `needs_review`, provenance, and open
  questions.
- **O2 (critical)** — Preserve Director Revenue Operations and VP Revenue
  Systems as a material title conflict; procurement and Salesforce replacement
  remain unverified, role/influence and pain inferences remain hypotheses,
  confidence is medium, and `needs_review: true`.

## Bulk contract

- **B1 (critical)** — Start with research-priority and persona distributions,
  low-confidence and review-needed counts, top inspected signals, common risks,
  and common open questions.
- **B2 (critical)** — Return every lead once with company, title, persona,
  inspected evidence, unverified claims, hypotheses, conflicts, persona
  relevance, role/influence, timing, pain, personalization, priority,
  confidence, review flag, recommendation, provenance, and open questions.
- **B3** — Nina is high priority/high confidence, Omar medium priority/medium
  confidence, Owen research-needed/low confidence; only Owen needs review, and
  his tokenized link is neither opened nor reproduced.

## Promotion contract

- **P1 (critical)** — Infer `emea` persona ownership and target exactly
  `suborgs/emea/research/leads/lea-novak.md`; canonical and physical paths are
  not interchangeable and `people/` is not the research namespace.
- **P2 (critical)** — Before any write, show one message containing relative
  target, purpose, no-external-side-effects statement, complete exact Markdown,
  and an approval question; consume the scripted approval exactly once.
- **P3 (critical)** — After approval, create exactly the target file, write the
  exact preview, and commit only it from the context-repo root without amend or
  push.
- **P4 (critical)** — Promoted Markdown has one H1 then these H2 sections in
  order: `Identity`, `Research Scope`, `Executive Brief`, `Inspected Findings`,
  `Unverified Claims`, `Persona Relevance`, `Role And Influence Hypotheses`,
  `Timing Signals`, `Pain Hypotheses`, `Risks`, `Personalization Angles`,
  `Recommended Next Step`, `Evidence`, `Conflicts`, `Review Needs`, `Open Questions`.
- **P5** — Preserve source publishers/dates, title, CISO reporting line,
  three-market scope, 2026-11-30 deadline, evidence-fragmentation signal,
  qualified persona, hypothesis boundaries, provenance, confidence, review
  needs, and questions; final report includes exact changed file and commit.

## Failure traceability

| Failure | Assertion(s) |
| --- | --- |
| F1 response-only research was persisted and final brief content omitted | A3, O1 |
| F2 workflow source/working/final metadata drifted | A1-A2, A8 |
| F3 ancillary unverified notes inflated review counts | A6, B1, B3 |
| F4 no-evidence lead was labeled low/hold instead of research-needed | B1, B3 |
| F5 promotion wrote to `people/` with a variable person schema | P1, P3-P5 |
| F6 unsafe-source and provenance handling varied | A3, A5, B2-B3 |
