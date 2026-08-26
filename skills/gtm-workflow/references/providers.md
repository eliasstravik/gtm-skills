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

The call returns a validated `value`, the cost attributed to this run, and `cache_hit`, `success`, or `empty`. A cache miss stores the adapter payload in `enrichment_cache.raw` before schema parsing and keeps the parsed copy in `value`. Cache hits parse `raw` so added schema fields can use the original response. Rows written before v4 have no `raw`, so they fall back to `value`. A cache hit writes a ledger row with zero cost. A miss writes the cache and one ledger row. A throw writes one `error` row and rethrows.

When the service reports actual cost, return `{ value, costUsd }` from the adapter call. Otherwise `provider()` records the accepted fixed cost. `agent()` records reported model cost when available and the accepted `maxUsd` projection otherwise. Outcome reports distinguish projected model cost.

## Empty, error, and retry behavior

The default empty rules are `null`, an empty array, or an object with no keys. Supply `isEmpty` when the endpoint uses a non-empty sentinel.

Classify errors by what the workflow should do:

| Condition | Behavior |
| --- | --- |
| Invalid input or permanent rejection | Throw a normal error. The row fails and continues. |
| Authentication or account limit | Throw a normal error with a short actionable message. Do not retry rows automatically. |
| Charged request with invalid output | Throw a normal error. `maxRetries = 0` prevents rebilling. |
| Confirmed unbilled transient failure | Throw `RetryableError`. The enclosing step may use a small bounded retry count. |
| Asynchronous job accepted | Poll inside the paid step with a bounded timeout, or use a workflow webhook when the service can call back. |

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
