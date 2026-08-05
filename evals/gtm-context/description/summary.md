# Description optimization summary

Model: `gpt-5.6-sol` only. The discontinued Fable probe was stopped and excluded from evidence.

## Eval set

- 20 realistic queries: 10 trigger and 10 near-miss no-trigger cases.
- Deterministic split within each class: first 6 training, final 4 held out.
- Required near misses cover ICPs, personas, account segmentation/scoring, and account/lead research, plus CRM administration, ordinary Git/folder work, and a non-GTM knowledge base.

## Iterations

| Candidate | Codex discovery smoke | Result |
| --- | ---: | --- |
| Original concise description | 19/20 (95%) | Best discovery behavior; one account-segmentation over-read |
| GPT candidate 1, long explicit exclusions | 17/20 (85%) | Regressed by making excluded keywords salient |
| Direct repository-outcome candidate | 18/20 (90%) | Fixed segmentation but regressed personas and ordinary Git |
| Narrow direct-outcome candidate | 17/20 (85%) | Regressed ICPs, personas, and segmentation |

The original description remained the strongest actual-discovery candidate. The skill-creator-equivalent Codex description classifier then tested it three times per query:

- Overall: 60/60 (100%)
- Training: 36/36 (100%)
- Held out: 24/24 (100%)
- Positive recall: 100%
- Negative specificity: 100%

Evidence: `codex-results/current-classifier-3x/results.json` and its per-run transcripts.

## Best description

> Triggers when the user invokes `/gtm-context` or asks to create, import, update, delete, validate, or repair a GTM context repo or folder, including adding teammates or suborganizations. Not for defining ICPs or personas, segmenting or scoring accounts, or researching accounts or leads.

This text is applied verbatim in the shipping `SKILL.md`.
