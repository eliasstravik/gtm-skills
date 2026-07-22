# Full parity verification

Date: 2026-07-22.

All nine rebuilt skills completed their skill-creator done-gates, were committed
one at a time, installed globally through the skills CLI, and verified as exact
copies under `~/.agents/skills/`:

1. `gtm-setup`
2. `gtm-define-icp`
3. `gtm-define-personas`
4. `gtm-account-segmentation`
5. `gtm-account-scoring`
6. `gtm-account-research`
7. `gtm-lead-segmentation`
8. `gtm-lead-scoring`
9. `gtm-lead-research`

Each skill has committed eval prompts, assertions, fresh hermetic fixtures,
baseline-failure records, accepted benchmark results, trigger queries, and
description-optimization evidence under `evals/<skill>/`. Official
skill-creator viewers were generated and privately served through Tailscale at
each review gate; the client waived per-skill confirmation and clean self-review
was accepted as empty feedback.

## All-nine trigger smoke

The final smoke placed all nine authoritative installed descriptions in one
routing matrix with 36 queries:

- three positive queries per skill (27 total);
- nine deliberately out-of-scope queries expected to select `none`.

`gpt-5.6-luna` and `gpt-5.6-terra` returned identical, fully correct decisions:
**72/72**. Every skill selected all three of its intended cases, no sibling
captured another skill's case, and every out-of-scope case selected `none`.

All build/eval execution used GPT-5.6 Luna, Terra, or Sol according to role. No
Fable or Claude model was used. Eval runs never accessed `~/.gtm`.

## Deferred client decision

Publishing the new repository and the old repository's fate remain deliberately
unchanged pending explicit client direction, per the approved plan.
