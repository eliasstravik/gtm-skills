# All-nine trigger smoke

Date: 2026-08-02.

## Accepted protocol

`matrix.json` is the frozen 36-query matrix: three positives for each of nine skills and nine out-of-scope negatives. The negatives include score-versus-segment, account-versus-lead, CRM mutation, outbound execution, numeric-rubric authoring, generic analytics, spreadsheet cleanup, non-GTM repository setup, and publishing near misses.

Each query was judged against all nine authoritative globally installed descriptions at once. The serial, checkpointed Codex CLI harness ran every query three times with `gpt-5.6-terra` at low reasoning and selected the simple majority. Acceptance required all 36 majority decisions to be correct. `results.json` preserves the installed catalog, hashes, protocol, all 108 run records, and all 36 decisions.

## Result

The accepted rerun passed 36/36 majority decisions. All 36 decisions were unanimous, so 108/108 individual runs were also correct. The nine skills caught all 27 positive requests, no sibling stole a request, and all nine negatives selected `NONE`.

| Expected route | Queries | Correct majorities | Correct runs |
| --- | ---: | ---: | ---: |
| Nine GTM skills | 27 | 27/27 | 81/81 |
| `NONE` | 9 | 9/9 | 27/27 |
| **Total** | **36** | **36/36** | **108/108** |

The installed-description catalog SHA-256 was `601bd3c12c7cf830672f0a94ee362f7b1d195990e30aeee3a9162d87ec75812f`; the matrix SHA-256 was `a2e1c85d9464ec13d5c5c2c53065c75019f44b2662abc685ae6550f8df86d010`. The 108 measured host-wall-clock durations totaled 584.029 seconds, ranging from 3.963 to 12.219 seconds. Codex CLI completion output exposed no token totals, so no token figures were estimated.

## Failure, repair, and full rerun

The first full smoke used the pre-repair catalog. Its numeric-rubric negative selected `gtm-account-scoring` in two of three runs, correctly failing acceptance. A sanctioned GPT-5.6 description ratchet added that request to the held-out negatives while preserving 20 queries, a stratified 60/40 split, three serial runs per query, TEST-first winner selection, and a five-iteration cap.

The original description scored TRAIN 36/36 and TEST 23/24. The conforming iteration-2 winner scored TRAIN 36/36 and TEST 24/24, was applied verbatim, revalidated, and reinstalled byte-identically. The complete 36-query smoke then reran from fresh checkpoints; no result from the failed catalog was reused. The repaired numeric-rubric case selected `NONE` in all three accepted runs.

No Claude-family model, Claude Code, `claude` CLI, Fable model, or model-invoking skill-creator script was used for the smoke or repair. Model-free Python utilities and filesystem paths whose names contain `.claude` are not model invocation. No probe or command file was created, and no real GTM home, context repository, or home configuration was read or written.
