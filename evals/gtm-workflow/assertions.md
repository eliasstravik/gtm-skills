# GTM workflow evaluation assertions

The deterministic grader maps each sentence in `evals.json` to repository state, transcript text, or both. Model-graded evaluations use mocks and must not call live providers, models, deployments, or credential endpoints.

## Cross-case controls

- Every question-bearing assistant turn starts with one bold question.
- Every discrete choice uses numbered options, at most one `(Recommended)`, and the exact reply line.
- No transcript contains `AskUserQuestion`, a value from ignored environment files, or credentials.
- Headered v10 managed files match their recorded SHA-256 hashes after create or accepted update work; local modifications are diffed before recopy.
- Runtime state, environment files, Turso pull files, and `data/` remain ignored.
- Database generation and migration happen only after the user accepts the table proposal.
- Inspection cases are read-only. Sandbox cases do not expose ports or use remote Git commands.

## Authoring controls

- Every workflow declares its run location, kind, owner, providers, input schema, and spend caps.
- Scheduled workflows also declare a schedule and `scheduledInput`.
- Kebab-case files export camelCase functions.
- Typed business tables live in `db/tables/`; fixed runtime tables live in `lib/schema.ts`.
- `runRows()` enforces `MAX_ROWS` and projected `MAX_SPEND_USD` before spend, then checks ledger actuals after every row.
- Every paid step sets `maxRetries = 0`; every paid call passes through `provider()` or `agent()` with run metadata.
- Each row isolates ordinary errors; authentication and quota errors stop with a reason and remaining keys.
- Dry runs validate the exported input schema, count parsed rows, and make no route, provider, model, ledger, or database mutation.

## Runtime controls

- Start routes insert the durable row before `start()`, pass searchable attributes, require the production commit header, and reject a matching live run with 409; the workflow self-registers its SDK run id.
- GET starts a scheduled workflow with `[null, meta]`; POST starts with `[body, meta]`.
- `--wait` returns at `waiting` so the operator can review approval or trigger state.
- Approvals resume through the generated token route. Zombie recovery cancels by run ID and then reconciles by run key.
- The cancel route records `cancelling` without finishing the row, keeps duplicate protection closed, then reconciles terminal `cancelled`; stale approvals return 409.
- Denial records `stopped`, approval expiry records `timed_out`, and status output includes stop reason, remaining keys, failed step, run URL, and cost sources.
- Paid cache misses write `pending` before the call; terminal reconciliation converts stale pending rows to `lost`. Cache hits cost zero, pre-call failures cost zero, and cost sources distinguish reported, fixed, and projected.
- Triggered workflows prefer the bearer-protected typed trigger route; public per-run webhooks remain capabilities and require payload validation.

## Cloud and sandbox controls

- The Turso setup, environment pull, approval-gated cloud migration, atomic `main` commit, Git-connected production deployment, and exact-SHA verification are ordered actions.
- A preexisting `.env.local` is never deleted; a temporary one is removed only when the deploy flow created it.
- Secret values move only through environment-aware commands and never enter evidence.
- Sandbox mode rejects file databases and CLI model backends. A hosted sandbox starts no real run, holds a read-only database credential, and applies migrations only inside the approval-gated save.
- No live cloud, provider, model, or credential-brokering operation is part of the deterministic suite.
- Hosted controls keep production run bearers, OIDC tokens, and public webhook URLs outside both the sandbox and the visible transcript. Hook tokens only name pending stages. No Vercel deploy token exists.
- The save gate names its production deployment effect. Its approved operation applies backward-compatible migrations before the atomic `main` commit. Preview and status are read-only; real start, approval, and cancel remain separately approval-gated. The save names each migration and shows full SQL for non-additive statements.
- A trusted start waits for `GET /api/deployment` to report the accepted commit and sends the same SHA; a missing or mismatched header is rejected.
- Cloud query and Studio require the read-only token and never reuse the migration token.
- The shipped command hook allows inspection and dry runs but asks for spend, decisions, cancellation, migrations, deployment, or unsafe shell syntax.
- A hosted Git deployment requires a verified commit author mapped to the Vercel owner or team; the GitHub App remains the committer.
