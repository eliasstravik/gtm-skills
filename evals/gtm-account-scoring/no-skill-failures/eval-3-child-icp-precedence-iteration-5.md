# Eval 3 — child-precedence baseline failures, iteration 5

Source: accepted fresh `gpt-5.6-terra` without-skill run. The full transcript remains in the gitignored workspace; failing evidence below is preserved verbatim.

## Correct precedence with the wrong result contract

The baseline correctly explained:

> The local `emea/enterprise` definition is the matched, governing ICP; root `enterprise` is shadowed, while root `mid-market` remains inherited but is not the matched ICP.

Its final result instead used:

> - Fit judgment: Qualified

It then copied the ICP document's `medium` confidence, source, review need, and open question into the account response. It omitted the exact working line, repo-relative source paths, exact `strong-fit` Band, named Fit Signals, fixed fields, account-level high/false calibration, and explicit no-side-effects metadata.
