# Enrichment And Safety

Load this reference when the user provides setup source links, asks to seed context from sources, or any source may be private, sensitive, conflicting, or unclear.

## Enrichment Inputs

After required setup inputs are collected, the user may provide:

- Organization website
- Product pages, docs, help center, proof pages, or case studies
- Public company or directory pages
- CRM/account pages or internal docs available to the agent
- Active Person profile links such as LinkedIn, personal site, GitHub, calendar/about page, or approved social profiles
- Quick notes the user wants preserved or considered

Links and quick notes are optional. If skipped or unavailable, write sparse templates and report enrichment as `skipped` or `unavailable`.

## Bounded Setup Research

Use source-assisted enrichment to draft initial durable context, not to run full account research. Focus on:

- Organization description
- Products or offerings
- Positioning and proof points
- Person focus, responsibilities, goals, and working preferences
- Workspace offering, market, GTM motion, target outcomes, messaging notes, constraints, and open questions
- Optional Business Unit or Team scope when the user provided that chain

Do not invent missing facts. Leave unknown sections sparse or add open questions.

## Link Classification

Classify every setup source link before saving it.

Use `scripts/classify_source_links.py` when available so the public/private/unsafe decision is deterministic before the enrichment preview. Treat the helper output as the starting classification; if the content or user context makes sensitivity unclear, ask before committing the URL.

### Public-looking links

Examples: official websites, public product pages, public docs, public case studies, public LinkedIn/company/profile pages intentionally provided by the user.

Behavior: save after normal enrichment confirmation.

### Internal/private-looking links

Examples: private docs, CRM/account pages, internal Notion/Google Docs/Drive links, company admin/app URLs, access-controlled pages without obvious URL secrets.

Behavior: ask explicit confirmation before committing the URL. If the user wants the source remembered without the URL, save a safe source label instead.

### Secret-bearing, signed, tokenized, invite, or local-only links

Examples: invite URLs, signed storage URLs, URLs with `token`, `access_token`, `api_key`, `key`, `signature`, `X-Amz-Signature`, `sig`, `auth`, `session`, embedded credentials, localhost URLs, or private tunnel URLs.

Behavior: never commit. Redact in warnings and, when useful to confirmed context, propose a safe source label.

## Clarification Rules

Ask focused clarification questions when source-assisted enrichment finds conflicting or unclear information that materially affects GTM context:

- ICP, market, motion, pricing, compliance, proof points, segmentation, or scoring implications
- company size, target customer, product category, or team scope when sources conflict
- active Person role/focus when sources are stale or ambiguous

If unresolved, do not write the claim as fact. Leave the affected field blank or record it as an open question. Continue setup with confirmed context.

## Enrichment Preview

Before writing enriched durable context, show a section-by-section preview grouped by target file:

```text
Proposed setup enrichment

organization.md
- What this organization is: ...
- Products / offerings: ...
- Proof points: ...
- Sources: 3

people/<person-id>.md
- Focus: ...
- Working preferences: ...

workspaces/<workspace-id>/context.md
- Offering: ...
- Market: ...
- GTM motion: ...

Sources to save
- Official website: https://example.com
- Internal sales deck, provided during setup. Link not committed.

Omitted/redacted
- 1 signed/tokenized link omitted for safety

Options
1. Apply all
2. Edit before applying
3. Apply selected sections
4. Keep sparse templates
5. Add more links/context and retry enrichment
```

Only accepted or edited-and-accepted sections become confirmed setup enrichment.

## Safe Source Labels

Use safe labels when a private or sensitive source supported confirmed context but the URL must not be committed.

Acceptable:

```md
- Internal sales deck, provided during setup. Link not committed.
- Private CRM account page, used during setup. Link not committed.
```

Do not include actual sensitive URLs, tokens, invite codes, document IDs, project codenames, access-controlled path details, or anything the label itself would leak. Show every proposed safe label in the preview and let the user accept, edit, or remove it.

## Commit Rules

Confirmed enrichment is durable setup context and may be included in `Initialize GTM context project`.

Do not commit:

- unconfirmed enrichment
- raw research scratch notes
- unresolved conflicts represented as facts
- secret-bearing, signed, tokenized, invite, credential-bearing, local-only, or unapproved private URLs
- temporary extraction outputs

If the user confirms only part of the enrichment, write and commit only confirmed parts. Report skipped, unresolved, omitted, redacted, and safe-label counts in the setup summary.
