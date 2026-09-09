# Event sources

Use permanent event intake for a new run per booking or business event. Use `waitForTrigger()` and the protected run trigger route for a callback to an existing waiting run.

For fixed subdaily cron intervals, append `?cadence-minutes=60` or another positive divisor of 1440 to the managed GET route in the accepted cron entry. Starts deduplicate within that UTC admission window rather than the whole day. Without the parameter, the daily behavior stays unchanged. Windows use arrival time; if delayed delivery must retain its original occurrence, use signed event intake with the scheduler's occurrence ID instead. A cron configuration and an intake subscription are distinct source definitions.

## Contract

The managed `POST /api/events/<source>` route reads the workflow-owned `events/index.ts` registry. Each source owns a fixed workflow path, enabled flag, signing-secret environment name, signature header, raw-body byte limit, daily event limit, accepted per-run spend, and parser. Unknown/disabled sources return 404; missing configuration 503; oversized input 413; invalid signature 401; invalid input 400; ignored types 204; accepted/duplicate events 202; exhausted daily quota 429.

The supplied verifier accepts HMAC-SHA256 hex over the exact request bytes. Other signature schemes need a separately verified adapter; do not pretend that every service signs the same way. Verify before JSON parsing. The parser validates the event schema, rejects stale timestamps, maps only required fields, and returns a stable provider event identity. Untrusted payloads cannot select a workflow, tools, credentials, or destinations.

`workflow_runs` stores the accepted event's permanent identity in its run key and `scheduled_for`. Deduplication survives run completion. Daily admission uses one atomic insert and counts UTC-day accepted events for that source, including failed/uncertain starts. The accepted frequency and per-run spend determine the source's maximum planned daily spend. Use conservative per-request quotes if a hard dollar ceiling is required.

## Booking example

For Cal.com, verify `x-cal-signature-256` using the webhook's shared secret. Confirm the current provider documentation and save a redacted booking fixture before implementing its parser. Subscribe only to the accepted event types. A booking UID identifies a booking, not every update to it; for created-only intake it can identify the work, while reschedule/cancel handling needs event type and provider event timestamp or delivery identity as well.

The parser returns the booking identity and required attendee/company fields. It does not return an agent prompt supplied by the sender. The workflow adds the committed instructions, invokes `durableAgent()` if investigation is requested, validates and saves the brief, then calls the fixed Slack delivery adapter. For fixed enrichment, use ordinary steps after the same intake.

## Enable, change, disable

Include source, accepted events, fields sent to each service, tools/effects, destination, frequency, spend, duplicate behavior, and disable behavior in the saved workflow's approval. This is standing authorization for matching future events, not an approval for every booking. A material expansion needs an updated accepted policy.

Configure credential values in the workflow project's trusted environment. Never request them in Slack. Initially ship the source disabled; enable it in an accepted tracked change after configuration. The saved commit and its Git deployment own the policy. Do not create a second agent-owned database or deployment tool.

Verify deployment protection permits this specific signed intake route. Do not disable protection for control routes. Register the resulting URL with the calendar provider only when that concrete integration is requested. Test with fixtures first; a real booking run or Slack post requires the accepted production scope.

Disable by committing `enabled: false` for the source. This stops new intake after that commit deploys; it does not cancel already accepted runs. Use the run cancellation control separately when requested. Inspect event runs and quota use through read-only queries of `workflow_runs` and the normal run-status control.

## Recovery

If the process fails between reserving an event and recording the SDK run id, a provider retry returns the same receipt and does not start a second run. The workflow's registration step normally attaches its id. If no run id arrives, inspect native runs by the `gtmRunKey` attribute and the source. An uncertain `start()` result sets `recoveryRequired`; no automatic retry assumes the first attempt was unbilled.

When a native run exists, reconcile its identity and result. When evidence proves no run started, prepare the mapped input for an explicitly approved ordinary start and retain the event claim. Record the recovery run in the workflow's business results. Never delete the event claim to make retries work.

Provider duplicate suppression is not exactly-once delivery to Slack. Save the brief first and give the delivery adapter a stable business operation identity. On an ambiguous send, inspect delivery before repeating it.
