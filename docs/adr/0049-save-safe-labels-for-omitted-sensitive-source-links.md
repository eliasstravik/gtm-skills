# ADR 0049: Save safe labels for omitted sensitive source links when they support confirmed context

## Status

Accepted

## Context

ADR 0048 says `gtm-setup` must classify source links before saving them. Secret-bearing, signed, tokenized, invite, credential-bearing, local-only, or otherwise unsafe links must not be committed. Some private/internal links also should not be committed unless the user explicitly confirms they are safe to store.

However, a sensitive or private source may still be useful evidence for confirmed durable context. If the agent used an internal sales deck, private CRM account page, or private document to draft confirmed context, future readers should be able to understand that a source existed without exposing the sensitive URL.

## Decision

If a sensitive/private source link was used to support confirmed setup context but the actual URL should not be committed, `gtm-setup` should save a human-safe source label by default.

Example:

```md
## Website / sources

- Internal sales deck, provided during setup. Link not committed.
- Private CRM account page, used during setup. Link not committed.
```

Rules:

1. Save a safe label only when the omitted link was actually used to support confirmed durable context.
2. Do not save labels for unused omitted links.
3. Never include the actual sensitive URL.
4. Never include secret-bearing query parameters, tokens, credentials, invite codes, document IDs, or access-controlled path details in the label.
5. The user may opt out of saving even the safe label.
6. Labels should be human-readable and non-sensitive.
7. Labels should explain source type and setup use, not expose access details.
8. If a label itself would reveal sensitive information, omit it and report only that a source was omitted/redacted in the setup summary.
9. ADR 0050 defines that proposed safe labels must be shown in the enrichment preview before they are written.
10. ADR 0051 defines safe labels as starting evidence for later skills, but weaker than accessible source links because the omitted URL cannot be re-fetched automatically.

Acceptable labels:

```md
- Internal sales deck, provided during setup. Link not committed.
- Private CRM account page, used during setup. Link not committed.
- Internal product brief, provided during setup. Link not committed.
```

Unacceptable labels:

```md
- https://app.company.com/share?token=...
- Internal deck from confidential Project Falcon board. Link not committed.
- Private CRM page for unreleased acquisition target. Link not committed.
```

## Consequences

- Future agents can see that confirmed context was supported by a private source without seeing the private URL.
- Sensitive URLs are not persisted in git history.
- Source transparency improves without leaking confidential details.
- Users retain control over whether even safe labels are saved.
