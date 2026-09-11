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

The current `skills` CLI ignores `--dir`, but
`npx skills add eliasstravik/gtm-skills#simplify --subagent root --copy --yes`
installs into `agent/skills/`. Eve 0.52.5 includes that tree in its compiled
workspace resources and exposes the files through the runtime skill handle.

## Eve firewall and wait spikes

A live Vercel Sandbox accepted a policy update that replaced Git's placeholder
Basic header with a fresh connector token; a private clone and push dry-run
succeeded without recreating the session. A ten-minute attached command did not
return after its deadline, so long runs use the named background-plus-`watch_url`
fallback. Eve emits `approval.settled`, so Slack posts the saving status after
approval.
