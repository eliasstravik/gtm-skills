# gtm-setup — accepted done-gate record (iteration 2)

Date: 2026-08-02. Model (all arms, all graders, all comparators, the build
itself): **claude-fable-5** (Fable 5) — the session model, per the repo's
no-model-policy rule. Autonomous build under the client waiver (PLAN.md §G5):
viewer generated each iteration (`iteration-N/review.html`), every transcript
read by the building agent as its own harshest reviewer; exit = every critical
assertion passing + clean self-review.

## Benchmark (accepted, iteration 2)

| Metric | With skill | Without skill | Delta |
|---|---|---|---|
| Pass rate | **100.0%** (39/39) | 43.8% (17/39) | **+56.2 pts** |
| Per-eval | e1 13/13 · e2 13/13 · e3 11/13* → all 13/13 | e1 4/13 · e2 2/13 · e3 11/13 | — |
| Time (mean) | 115.0s | 116.4s | ≈ 0 |

*e3 with-skill was 11/12 in iteration 1; 13/13 in iteration 2 after the earned
Details lines. Iteration 1 aggregate: 91.9% vs 50.1% (+41.8). Token deltas are
not cited: the baseline token proxy variance (±2267) exceeds the signal.

## Blind forced comparison (iteration 1, bare core — skill-issue gate 6)

Outputs-only, arm-blind, A/B assignment varied per eval and recorded in
`blind/assignment-key.json`: with-skill won **3/3** (contract shape; template
restoration vs reintroduced registry model; supplied-facts fidelity).

## What each iteration changed and why

**Iteration 1 (bare core: H1 + 7-row Switch, 13 body lines, templates only).**
With-skill 11/12 on each eval. Failures, each earning a Details line:

- **F** (e1): persisted the de-tokenized sheet URL instead of a safe label →
  Details: never persist/echo tokenized links, even stripped; safe label +
  rotation advice.
- **H** (e2): repair split into two `Repair GTM context repo` commits →
  Details: a repair is one artifact, one commit.
- **L** (e3): suborg org.md enriched from the parent org file + claimed
  inheritance of nonexistent collections → Details: supplied facts only.
- **A2** (authored per the jurisdiction rule from the vacuous-A insight: the
  remote question was a free-text either/or; no run ever produced the mandated
  numbered choice list) → Details: interview choice questions as numbered
  lists ending `Reply with a number, or type your answer.`, ≤1 `(Recommended)`;
  approval questions keep their preview-gate form.
- Two Calls added (mandated support files, anchored to F and H):
  `references/context-contract.md` (contract, doctor checklist, source-link
  rules) and `references/setup-flows.md` (flow steps, question forms, commit
  discipline).

**Iteration 2 (bare core + 6 Details lines, body 24 lines).** 39/39. The
remote question appears as a numbered list with the exact closing line in both
gated evals; e1 records the safe label "the team's account sheet (Google
Sheets)" with zero URL/token occurrences anywhere; e2 lands exactly one repair
commit; e3 scaffolds with supplied facts only and refuses the chat-surface
create with the CLI redirect.

## Honest notes (self-review findings that did not block the gate)

- e1 it-2 redacted the user's own scripted link-reply in transcript.md
  ("[link withheld]") — safety-correct but weakens falsifiability of F's
  never-echoed check; graders verified via zero-grep over repo + transcript.
- e3's doctor assertions (O/P) rest partly on transcript self-report; a
  narrated-only doctor would grade the same. Mitigated by the programmatic
  checks on outputs; noted for future eval hardening.
- Iteration-1 isolation leak: the e2 baseline read the host's real
  `~/.gtm/state.json` (read-only). The eval conventions now ban reading any
  real GTM home; no run touched it in iteration 2.
- e3 baseline scores high (11/13) by design: the healthy fixture carries the
  constitution. The discriminators there are J (surface refusal) and L
  (supplied-facts) — both failed by baselines in both iterations.
