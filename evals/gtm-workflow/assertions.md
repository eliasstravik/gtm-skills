# GTM workflow evaluation assertions

The deterministic grader maps each sentence in `evals.json` to repository state, transcript text, or both.

## Cross-case controls

- Every question-bearing assistant turn starts with one bold question.
- Every discrete choice uses numbered options, at most one `(Recommended)`, and the exact reply line.
- No transcript contains `AskUserQuestion`, a value from ignored `.env`, or credentials.
- Shared `lib/agent.ts` and both API routes match the shipped templates after any create or update.
- Durable changes stay scoped, clean, and on `main`; inspection and handoff cases make no commit.
- Runtime state and `data/` remain ignored.

## Authoring controls

- On-demand and triggered headers have five content lines; scheduled headers have six.
- Kebab-case files export camelCase functions.
- Scheduled fallback is the first statement after `"use workflow"`.
- `MAX_ROWS` and projected `MAX_SPEND_USD` are enforced before provider or agent spend.
- Every `agent()` call passes `maxUsd: COST_PER_ROW_USD`.
- Each row catches errors into `failed` and continues.
- Pilots and full runs use the authenticated HTTP route with explicit bodies.

## Deployment controls

- CLI and login checks precede all project mutations.
- A missing Gateway key blocks before `vercel link`.
- Secret values move only through the shell.
- Live state requires a production deploy plus a successful route-started pilot.
