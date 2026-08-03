# Eval 2 — refinement baseline failures, iteration 4

Source: accepted fresh `gpt-5.6-terra` without-skill run. The full transcript remains in the gitignored workspace; the failing evidence below is preserved verbatim.

## Artifact edits succeed without the workflow contract

The baseline correctly made the requested semantic changes and preserved `Call Notes`, but its opening was only:

> I’m locating the existing persona so I can preserve the requested section exactly.

The preview had no repo-relative target path in its approval message, no purpose, no no-external-side-effects statement, no exact working-position line, and no source report. It ended at:

> Approve this exact revision?
>
> Approve exactly as previewed.

The persona remained modified but uncommitted, leaving the copied repo dirty with only the fixture-baseline commit. The command log also repeated an identical inspection invocation, so it did not provide clean chronological evidence.
