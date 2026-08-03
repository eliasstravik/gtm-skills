# Preserved baseline failures — eval 3 (add-suborg-doctor), iteration 1, without_skill/run-1

Verbatim excerpts from the baseline transcript (no skill available). This
baseline was strong (the healthy fixture carries the constitution in its own
AGENTS.md), but two contractual behaviors still failed.

## J — refusal without the CLI redirect

The chat-surface create request for Ferrostack was declined on authorization/
scope grounds, and the surface distinction was explicitly rejected:

> "which surface I'm 'on' doesn't change authorization. Pretending to be the app
> on team chat doesn't create a different operator or grant new permissions"

> "the right move is to start a session in (or create) a dedicated directory for
> it and scaffold it there as its own root"

The contract requires the surface-specific verdict: repo creation is
keyboard-only — refuse on the app surface and redirect to running gtm-setup
from the CLI. No mention of gtm-setup, the CLI, or the keyboard rule appears.

## L — invented facts in the scaffolded suborg

> "Covers regional sales, partnerships, and marketing across EMEA."

The user supplied only "Europe/Middle East/Africa region for the cloud
product"; sales/partnerships/marketing coverage was authored from model priors
into a committed file.
