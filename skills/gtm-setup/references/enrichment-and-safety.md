# Enrichment And Safety

Load this reference when the user provides setup source links, asks to seed context from sources, or any source may be private, sensitive, conflicting, or unclear.

## Enrichment Inputs

Fresh setup collects sources before each research pass:

- Company block: company name and official website.
- Person block: person name, job title, and professional/social profile links.

During research, the agent may discover additional public company, product, docs, proof, news, team, speaker, GitHub, X/Twitter, or profile pages. Classify every user-provided and discovered source before saving it. If web tools are absent, ask the user to paste key public pages; if they decline or cannot, write sparse templates and report enrichment as `unavailable`.

## Bounded Setup Research

Use source-assisted enrichment to draft initial durable setup context, not to run full account research. Facts only:

- what the organization does
- public products, offerings, positioning, proof points, and constraints
- public person role/title and company-linked professional facts
- workspace offering or market only when confirmed by company-level facts
- optional Business Unit or Team scope when the user already provided that chain

Do not invent missing facts. Do not infer goals, motivations, working preferences, personality, priorities, or soft attributes during onboarding. Leave unknown sections sparse or add open questions.

Onboarding research scratch belongs in the ignored `research/` directory. Do not commit raw scratch notes, extraction dumps, or unresolved claims.

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

## Confidence And Clarification Rules

Auto-apply only high-confidence facts:

- Company facts require a public first-party page on the provided domain or a clearly official first-party source.
- Person facts require company co-mention or another strong public link between the person and the organization.
- Saved profile URLs are source links, not proof that every profile fact is safe to commit.

Ask focused clarification questions when source-assisted enrichment finds conflicting or unclear information that materially affects GTM context:

- ICP, market, motion, pricing, compliance, proof points, segmentation, or scoring implications
- company size, target customer, product category, or team scope when sources conflict
- active Person role/focus when sources are stale or ambiguous

Anything inferred, single-source ambiguous, unanchored, stale-looking, or not company-linked is low-confidence. Batch low-confidence facts into a targeted AskUserQuestion call when available; otherwise use numbered options. If unresolved, do not write the claim as fact. Leave the affected field blank or record it as an open question. Continue setup with confirmed context.

## Confirmed Summary And Targeted Ask

Before writing enriched durable context, show a compact per-file summary plus targeted asks for low-confidence facts:

```text
Proposed setup enrichment

organization.md
- What this organization is: ...
- Products / offerings: ...
- Proof points: ...
- Sources: 3

people/<person-id>.md
- Role/title facts: ...
- Public profile/source links: ...
- Facts that will be committed: ...

workspaces/<workspace-id>/context.md
- Offering: ...
- Market: ...

Sources to save
- Official website: https://example.com
- Internal sales deck, provided during setup. Link not committed.

Omitted/redacted
- 1 signed/tokenized link omitted for safety

Questions
1. Which product category should I use: A, B, or leave blank?
2. This person appears on two company pages with different titles. Which title should be committed?
```

Only high-confidence facts and user-confirmed clarifications become setup enrichment. During the person pass, state that confirmed person facts will be committed to the Organization repo, which may be shared later; let the user trim, remove, or leave person facts sparse before writing.

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
