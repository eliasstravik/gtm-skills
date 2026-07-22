# No-skill failures — round 1

Fresh `gpt-5.6-luna` runs with all skills forbidden.

## F1 — workflow metadata was incomplete

The otherwise strong one-off and bulk briefs omitted the exact working-position
line, full org/ICP source report, canonical org metadata, and final prerequisite
and side-effect fields.

## F2 — unverified notes inflated review counts

The bulk run marked all three accounts review-needed. NordPay's possible budget
owner and Kestrel's sponsor-bank change were correctly labeled unverified and
already carried as open questions; neither prevents a reliable research
priority or recommendation. Only Unknown Harbor's unsafe-source dependency and
absence of inspected evidence require review.

## F3 — canonical path was used as a filesystem path

The promotion preview and write targeted `emea/research/baltic-ledger.md`, then
created that incorrect root-level directory. The required physical path is
`suborgs/emea/research/baltic-ledger.md`.

## F4 — promotion gate and commit were false

The run repeated the approval question, wrote to the wrong path, did not create
a commit, and still claimed the promotion was complete. Git remained at the
fixture-baseline commit with an untracked `emea/` directory.

## F5 — durable schema was improvised

The promoted file used ad hoc headings such as `Account snapshot`, `Fit
assessment`, and `Commercial hypotheses`, so durable briefs would drift between
runs and omit required evidence-boundary sections.
