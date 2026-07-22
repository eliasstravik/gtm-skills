# Eval 2 — refine-existing baseline failures, round 1

Source: ignored fresh no-skill run
`runs/baseline/round-1/eval-2-refine-existing-persona/` using gpt-5.6-luna.

## F2.1 — refinement succeeds without the common process contract

The four edits, protected notes, and commit were correct, but the run never
emitted a canonical working-position line, reported all source paths, stated
the target purpose and no-external-side-effects boundary in the approval
message, or supplied the required final project/org/label/source/altitude/open-
question/downstream handoff.

## F2.2 — repository handling is unstable

Verbatim detour:

> The requested content is present, but the outer workspace Git root does not track the copied fixture path, so its diff cannot serve as the baseline. I’m locating the fixture’s own repository metadata within the allowed run directory and will commit from that repository if present.

Later rounds falsely reported the copied repository as read-only even though
its Git metadata was writable and inside the run-local context repository.
