# ADR 0048: Classify setup source links before saving them

## Status

Accepted

## Context

ADR 0041 defines source-assisted setup enrichment. ADR 0047 says confirmed public/user-approved source links should be saved in markdown context files, while sensitive links must not be committed.

Setup can receive a mix of public company links, private/internal links, invite links, signed URLs, tokenized share links, local development URLs, and other links that may contain secrets or expose private workspaces. Before saving any source link as durable context, `gtm-setup` needs a link-safety policy.

## Decision

`gtm-setup` should classify source links before saving them.

Link classes:

1. **Public-looking links**
   - Official websites
   - Public product pages
   - Public docs/help centers
   - Public case studies/customer pages
   - Public LinkedIn company pages
   - Public personal/profile links intentionally provided by the user

   Behavior: save after normal enrichment confirmation.

2. **Internal/private-looking links**
   - Private docs or workspace pages
   - CRM/account pages
   - Internal Notion/Google Docs/Drive links
   - Company app/admin URLs
   - Links that appear access-controlled but not secret-bearing

   Behavior: ask explicit confirmation before committing. If the user wants the source remembered without committing the URL, save a human-safe label instead.

3. **Secret-bearing, signed, tokenized, or invite links**
   - Invite URLs
   - Signed storage URLs
   - Links with API keys, access tokens, auth tokens, signatures, session IDs, or credentials in the URL
   - Links with query parameters such as `token`, `access_token`, `api_key`, `key`, `signature`, `X-Amz-Signature`, `sig`, `auth`, `session`, or similar
   - Links that include embedded username/password credentials
   - Localhost/private tunnel URLs that should not be durable context

   Behavior: do not commit. Warn the user and strip/redact the URL.

Examples that should trigger caution:

```text
https://company.com/invite/...
https://app.company.com/share?token=...
https://storage.example.com/file?X-Amz-Signature=...
https://docs.google.com/... private docs
https://notion.so/... internal workspace pages
http://localhost:...
```

If a private or sensitive source is useful but should not be committed, save a human-safe label instead:

```md
- Internal sales deck, provided during setup. Link not committed.
```

ADR 0049 defines when safe labels should be saved for omitted sensitive/private source links.

ADR 0050 defines that proposed safe labels must be previewed before they are written.

ADR 0051 defines classified/saved source links as starting evidence for later skills, not guaranteed truth.

Rules:

1. Classify every setup source link before saving it.
2. Obvious public company/product/social/profile links may be saved after normal enrichment confirmation.
3. Internal/private-looking links require explicit confirmation before committing.
4. Secret-bearing, signed, tokenized, invite, credential-bearing, and local-only links must not be committed.
5. Strip or redact unsafe URL query parameters when reporting warnings.
6. If link sensitivity is unclear, ask the user before committing the link.
7. If a link is useful but unsafe to commit and was used to support confirmed context, save a human-safe source label instead of the URL unless the user opts out.
8. Link safety applies even if `.gitignore` would not catch the URL, because URLs are often embedded inside markdown files.

## Consequences

- Useful public sources remain durable and auditable.
- Private/internal links are committed only with explicit user approval.
- Secret-bearing or temporary links are not accidentally persisted in git history.
- Agents can still record safe source labels when the actual URL should stay ephemeral.
