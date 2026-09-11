# GTM agent host contract

This is the small interface a hosted agent must provide so the installed skills behave like they do at a keyboard.

## Surface declarations

- Approval renders as one native card with fixed `Approve` and `Cancel` buttons. The card's plain-text summary is the approval request.
- Every workflow is hosted; never offer a local run.
- The checkout is `/workspace`, scratch is `/tmp/gtm-scratch`, and installed skills are exposed at the host's declared skills path.

Set `GTM_HOST=eve` for every command.

## Credentials at the firewall

Credentials never enter the model or general sandbox environment. The network firewall replaces these three placeholders per request:

- The CLI run bearer for calls to the configured workflow production host.
- The CLI Turso token for calls to the configured database host.
- Git's `x-access-token:gtm-sandbox` Basic header for the connected GitHub repository.

## Bash approval

Import the classifier from `agent/skills/gtm-workflow/scripts/command-permission.mjs`. `allow` executes immediately; `ask` is the default and requires a non-empty plain-language summary. Hash command plus summary after approval and permit up to two silent replays of that exact step. Changed text requires another card. Only one approval may be open.

## URL watcher

`watch_url` may make GET requests only to `/api/runs/*` and `/api/deployment` on the configured workflow host. It must not accept arbitrary headers or hosts.

## Skills fetch spike

Pending phase 3. Record the working install command and whether Eve bundles `agent/skills/**` here before deleting the existing vendoring code.

## Eve firewall and wait spikes

Pending phase 3. Record whether a per-request GitHub header transform works, whether one bash call can remain open for ten minutes, and whether Slack receives an approval-resolved callback before choosing either fallback.
