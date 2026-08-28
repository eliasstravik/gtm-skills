# Provider adapters

Read this reference before creating or changing an adapter.

## Adapter contract

An adapter lives at `providers/<name>.ts` and exports one plain async function per endpoint. It has no `"use step"` directive. The workflow calls it through `provider()` inside a named business step.

Document these facts in the adapter header:

- provider and endpoint identifiers used in the cache key;
- required environment variable names;
- input and output schema;
- fixed or reported cost per request;
- cache TTL;
- rate and concurrency limits;
- whether an empty response has a provider-specific meaning;
- whether the endpoint is synchronous, polled, or resumed by webhook.

Use these exact header labels so `gtm providers list` can index the adapter:

```ts
/**
 * Provider: company-data
 * Endpoints: organization-lookup-v1
 * Environment: COMPANY_DATA_API_KEY
 * Cost per request: $0.02 fixed
 * Cache TTL: 30 days
 * Mode: synchronous
 */
```

Run `npm run gtm -- providers list [keywords] --format json` before adding an adapter. Reuse a listed endpoint when its contract matches. The command reports environment names and set/unset state, never values, plus fixture coverage and importing workflows.

Mirror environment variable names empty into `.env.example`. Keep values in ignored `.env`, Vercel environment variables, or host-brokered headers. Adapter input never contains a credential because canonical input is stored in `enrichment_cache.inputs` and can be queried.

## Calling through the funnel

Use `provider()` with canonical business input:

```ts
const result = await provider({
  name: "company-data",
  endpoint: "organization-lookup-v1",
  input: { domain },
  schema: organizationSchema,
  ttlMs: 30 * 24 * 60 * 60 * 1_000,
  costUsd: 0.02,
  call: () => lookupOrganization({ domain }),
  meta,
  isEmpty: (value) => value.company === null,
});
```

The call returns a validated `value`, attributed cost and source, and `cache_hit`, `success`, or `empty`. A miss writes a `pending` ledger row before the request, then atomically writes the cache and final ledger state. Cache hits parse preserved `raw`, fall back to `value` for older rows, and cost zero; a cache-parse failure records `error`. Terminal reconciliation marks unresolved pending calls `lost` at the accepted fixed cost.

When the service reports actual cost, return `{ value, costUsd }`. Return `{ raw, value, costUsd }` and supply `parseRaw` when later schema expansion needs the original response. Otherwise `provider()` records fixed cost; `agent()` records reported model cost when available and projected `maxUsd` otherwise. Pre-call input or spawn failures use `ProviderPreCallError` and cost zero.

Throw short, actionable messages without request URLs or credentials. The library still strips query strings, bearer values, sensitive assignments, matching secret environment values, and text beyond its response limit before errors reach ledgers, run rows, routes, or CLI output.

## Slack Block Kit links

A Block Kit `button` with a `url` is still an interactive component: Slack sends an interaction payload and expects an acknowledgement within three seconds. Use a normal `mrkdwn` link when the workflow has no signed interaction endpoint. Add a URL button only when the user accepts the endpoint, Slack signing secret, acknowledgement handling, and replay protection.

## Empty, error, and retry behavior

The default empty rules are `null`, an empty array, or an object with no keys. Supply `isEmpty` when the endpoint uses a non-empty sentinel.

Classify errors by what the workflow should do:

| Condition | Behavior |
| --- | --- |
| Invalid input or permanent rejection | Throw a normal error. The row fails and continues. |
| Authentication failure | Throw `ProviderAuthError`. `runRows()` stops with `provider_auth` and records remaining keys. |
| Quota, billing, or account limit | Throw `ProviderQuotaError`. `runRows()` stops with `provider_quota` and records remaining keys. |
| Charged request with invalid output | Throw a normal error. `maxRetries = 0` prevents rebilling. |
| Confirmed unbilled transient failure | Import `RetryableError` from `"workflow"` and throw it. A bare throw uses the runtime's default retry policy unless the step sets `maxRetries = 0`; a bounded retry exception must catch every other error. |
| Asynchronous job accepted | Poll inside the paid step with a bounded timeout, or use a typed hook behind the authorized trigger route. Use a public webhook only when the caller cannot send a bearer. |

Never infer that a timeout was unbilled. Default to no retry.

## Rate and concurrency guidance

Read the current endpoint documentation before writing the adapter. Keep concurrency below the documented account limit and preserve the provider's request identifier in a normal result field when it helps support. Use provider-supported idempotency keys for external writes. Derive them from stable workflow input and the run key only when the endpoint's contract permits it.

Do not create a generic rate-window table or lease. The workflow owns batching and concurrency, while the duplicate-run index prevents identical live runs.

## Fixture-first tests

Tests live under `providers/__fixtures__/` and never call a paid service. Cover:

- canonical input and request shape;
- a validated success;
- provider-specific empty output;
- a permanent error;
- a confirmed unbilled retryable error when supported;
- reported cost when available;
- asynchronous poll or webhook completion when used.

The eval suite may use a fictitious loopback service. No real endpoint shape or credential ships with the skill.

## Sandbox adapters

With `GTM_SANDBOX=1`, the host may broker credentials by injecting an authorization header at the firewall. In that case the adapter omits that header and calls the allowed HTTPS host. All other request fields remain explicit and testable. The sandbox opens no port and stores no credential in input, output, cache, or ledger.
