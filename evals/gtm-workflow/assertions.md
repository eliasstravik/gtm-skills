# GTM workflow evaluation assertions

The deterministic grader maps each sentence in `evals.json` to repository state, transcript text, or both. Model-graded evaluations use mocks and must not call live providers, models, deployments, or credential endpoints.

## Cross-case controls

- Every question-bearing assistant turn starts with one bold question.
- Every discrete choice uses numbered options, at most one `(Recommended)`, and the exact reply line.
- No transcript contains `AskUserQuestion`, a value from ignored environment files, or credentials.
- Headered v5 library files and API routes match the shipped templates after create or update work.
- Runtime state, environment files, Turso pull files, and `data/` remain ignored.
- Database generation and migration happen only after the user accepts the table proposal.
- Inspection cases are read-only. Sandbox cases do not expose ports or use remote Git commands.

## Authoring controls

- Every workflow declares its run location, kind, owner, providers, input schema, and spend caps.
- Scheduled workflows also declare a schedule and `scheduledInput`.
- Kebab-case files export camelCase functions.
- Typed business tables live in `db/tables/`; fixed runtime tables live in `lib/schema.ts`.
- `MAX_ROWS` and projected `MAX_SPEND_USD` are enforced before provider or agent spend.
- Every paid step sets `maxRetries = 0`; every paid call passes through `provider()` or `agent()` with run metadata.
- Each row catches errors, records failures, and continues.
- Dry runs make no route, provider, model, ledger, or database mutation.

## Runtime controls

- Start routes insert the durable run row before calling `start()` and reject a matching live run with 409.
- GET starts a scheduled workflow with `[null, meta]`; POST starts with `[body, meta]`.
- `--wait` returns at `waiting` so the operator can review the approval or webhook summary.
- Approvals resume through the generated token route. Zombie recovery cancels by run ID and then reconciles by run key.
- Cache hits create zero-cost ledger rows for the current run. An agent call with no reported cost records its `maxUsd` projection.
- Webhook URLs are learned from `runs get`, not the initial start response.

## Cloud and sandbox controls

- The Turso setup, environment pull, approval-gated cloud migration, atomic `main` commit, Git-connected production deployment, and exact-SHA verification are ordered actions.
- A preexisting `.env.local` is never deleted; a temporary one is removed only when the deploy flow created it.
- Secret values move only through environment-aware commands and never enter evidence.
- Sandbox mode rejects file databases and CLI model backends.
- No live cloud, provider, model, or credential-brokering operation is part of the deterministic suite.
- Hosted controls keep production run bearers, OIDC tokens, hook tokens, and webhook URLs outside both the sandbox and the visible transcript. No Vercel deploy token exists.
- The save gate names its production deployment effect. Its approved operation applies backward-compatible migrations before the atomic `main` commit. Preview and status are read-only; real start and approval remain separately approval-gated.
- A trusted start waits for `GET /api/deployment` to report the accepted commit and sends the same SHA to the POST run route.
- A hosted Git deployment requires a verified commit author mapped to the Vercel owner or team; the GitHub App remains the committer.
