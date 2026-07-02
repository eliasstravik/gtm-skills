# ADR 0050: Preview safe source labels before writing them

## Status

Accepted

## Context

ADR 0048 classifies setup source links before saving them. ADR 0049 says that if a sensitive/private source link was used to support confirmed setup context, `gtm-setup` may save a human-safe source label instead of the actual URL.

A safe label is still durable context. Even without a URL, a label can reveal that a private source existed, what kind of source it was, or what area of the business it concerned. Therefore safe labels should be governed by the same confirmation principle as all other source-assisted setup enrichment.

## Decision

The enrichment confirmation preview must show proposed safe source labels before writing them.

Example preview:

```text
Sources to save
- Official website: https://example.com
- Internal sales deck, provided during setup. Link not committed.

Omitted/redacted
- 1 signed/tokenized link omitted for safety
```

Rules:

1. Show every proposed safe source label in the enrichment preview before writing it.
2. Let the user accept, edit, or remove each safe label.
3. Only accepted or edited-and-accepted labels become durable context.
4. Never show or write the sensitive URL behind the label.
5. Never include tokens, credentials, invite codes, document IDs, or access-controlled path details in the preview label.
6. Show omitted/redacted source counts or categories without printing secret-bearing URLs.
7. If the user removes a safe label, do not write the label, but still omit/redact the unsafe URL.
8. If a label itself appears too revealing, ask the user to edit it or omit it.

ADR 0051 defines accepted safe labels as starting evidence for later skills, but weaker than accessible source links because the omitted URL cannot be re-fetched automatically.

ADR 0052 defines how outputs cite safe labels as source provenance without exposing sensitive URLs.

## Consequences

- Users know exactly which non-URL source labels will become durable context.
- Safe labels follow the same confirmation flow as enriched facts.
- Sensitive URLs remain out of markdown and git history.
- Users can remove labels that are still too revealing.
