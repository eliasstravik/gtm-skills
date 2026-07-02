# ADR 0047: Save confirmed source links in markdown, not long `gtm.yaml` lists

## Status

Accepted

## Context

ADR 0041 defines source-assisted setup enrichment. Users can provide organization, product, proof, documentation, company-social, and active-person profile/source links so the agent can draft better initial durable context. ADR 0043 defines the enrichment confirmation preview, and ADR 0042 says confirmed enrichment is included in the initial commit.

Those source links are useful durable context. Future agents can revisit them, audit claims, refresh stale context, or understand why setup wrote a particular description. However, `gtm.yaml` should stay a concise machine-readable index, not a long bibliography or source dump.

Some links may also be private or sensitive. Public/user-approved source links are useful to commit, but credentials, signed URLs, invite links, API tokens, secret-bearing links, and sensitive internal URLs require care.

## Decision

Confirmed public or user-approved source links should be saved in the relevant markdown context files by default, not as long lists in `gtm.yaml`.

Organization sources belong in `organization.md`:

```md
## Website / sources

- Official website: https://example.com
- Product page: https://example.com/product
- Case studies: https://example.com/customers
- LinkedIn: https://linkedin.com/company/example
```

Person sources belong in `people/<person-id>.md`:

```md
## Links / sources

- LinkedIn: https://linkedin.com/in/...
- Personal site: https://...
- GitHub: https://github.com/...
```

Workspace, Business Unit, or Team sources may be saved in their relevant `Notes / open questions`, `Scope`, or source-oriented sections when they directly support that context.

Rules:

1. Public links can be saved by default after the user confirms enrichment.
2. User-provided profile/source links can be saved when the user confirms they should become durable context.
3. Private/internal links require explicit confirmation before committing.
4. Never save credentials, invite links, signed URLs, API tokens, secret-bearing URLs, or links whose query parameters contain secrets.
5. Do not store long source lists in `gtm.yaml`.
6. `gtm.yaml` may include a small structured field such as `website` only when useful and known.
7. Full source lists belong in markdown context files.
8. If a link is useful only for temporary extraction, keep it ephemeral unless the user confirms it as durable context.
9. If in doubt about link sensitivity, ask the user before committing it.

ADR 0048 defines the source-link classification policy used before saving links.

ADR 0049 defines when to save safe labels for omitted sensitive/private links that supported confirmed context.

ADR 0051 defines saved source links as starting evidence for later research, scoring, and segmentation skills rather than guaranteed truth.

## Consequences

- Durable context keeps useful source trails where humans and agents can read them.
- `gtm.yaml` stays concise and machine-readable.
- Sensitive links are not accidentally committed.
- Future enrichment and research can reuse confirmed source links without rerunning discovery from scratch.
- Later skills should still evaluate freshness, source quality, and contradictions before relying on saved links.
