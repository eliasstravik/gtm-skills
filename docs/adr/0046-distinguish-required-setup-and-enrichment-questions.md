# ADR 0046: Distinguish required setup questions from enrichment questions

## Status

Accepted

## Context

`gtm-setup` needs to create a valid GTM Context Project with minimal required information, while also supporting optional source-assisted enrichment. ADR 0045 says unresolved enrichment clarification should not block setup, but required setup fields and hard context prerequisites still block setup when missing.

To keep setup lightweight and predictable, the UI and implementation need an explicit distinction between questions that are required to create a valid project and questions that enrich the context but can be skipped or deferred.

## Decision

`gtm-setup` should model two question classes:

1. **Required setup questions** — the minimum answers needed to create or select a valid GTM Context Project.
2. **Enrichment questions** — optional questions used to improve generated context, usually through source-assisted research and user confirmation.

Required setup questions include:

- Organization name
- Active Person display name
- Active Person free-text role
- setup depth
- generated Organization ID confirmation or override
- generated Person ID confirmation or override
- generated Workspace ID confirmation or override
- enough information to form the minimum full context chain

Enrichment questions include:

- organization/source links
- active-person profile/source links
- company size
- market
- exact positioning
- proof points
- personal focus
- workspace messaging
- business-unit scope
- team scope
- other source-assisted clarification questions

Rules:

1. Missing required setup answers block setup.
2. Missing or unresolved enrichment answers do not block setup.
3. Source links are enrichment inputs and must be skippable.
4. Enrichment questions should be asked only after required setup answers are collected.
5. The UI should label optional enrichment clearly so setup does not feel like an endless intake form.
6. Unresolved enrichment answers should be left blank, recorded as open questions, or skipped according to ADR 0045.
7. Confirmed enrichment becomes durable setup context according to ADR 0042.
8. Required setup questions should stay minimal and operational.

## Consequences

- Setup can clearly explain which answers are required and which are optional.
- Users can complete setup quickly even when enrichment is incomplete.
- Agents can safely continue with sparse templates when enrichment is skipped or unresolved.
- Future setup implementations can validate blockers without treating every enrichment gap as fatal.
