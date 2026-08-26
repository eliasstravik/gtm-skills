# Live verification follow-ups

These checks are intentionally deferred. The issue implementation and deterministic verification do not provision services, deploy code, call real providers or models, pull production credentials, or consume paid credits.

1. Install the `tursocloud` Marketplace integration in a disposable Vercel project and confirm that production environment pull includes both Turso variables.
2. Apply `db:migrate:cloud`, deploy the fixture, and confirm a checkpointed production run can be inspected and approved.
3. Query the production rows with `gtm query --cloud` and inspect them with `db:studio:cloud`.
4. Invoke a deployed scheduled route once with `CRON_SECRET` and verify duplicate protection.
5. Resume a deployed `createWebhook()` URL once and verify the run reaches `completed`.
6. Repeat the cache and zero-cost rerun checks with a real provider and model under an explicit budget.
7. Verify sandbox HTTP transport, credential brokering, deployment authority, and trusted-host approval delivery in the gtm-agent environment.
8. Run the model-graded eval suite after approving its model-credit budget.
9. Recheck webhook resume when the Workflow SDK supports Node 24; the pinned SDK currently passes the end-to-end loopback check on Node 22.

Before committing any live evidence, scan it for bearer values, Turso tokens, model keys, provider keys, and `.env.turso` contents.
