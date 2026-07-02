# ADR 0043: Confirm source-assisted enrichment with a section preview

## Status

Accepted

## Context

ADR 0041 defines source-assisted setup enrichment. The user can provide source links, the agent researches and drafts initial durable context, and enriched context is written only after user confirmation. ADR 0042 says confirmed enrichment is included in the initial setup commit.

The confirmation step needs to be concrete enough that users can quickly understand what will become durable context, but lightweight enough that setup does not become a long manual intake form.

## Decision

After source-assisted research, `gtm-setup` should show a concise section-by-section enrichment preview before writing enriched context.

Example preview:

```text
Proposed setup enrichment

organization.md
- What this organization is: ...
- Products / offerings: ...
- Proof points: ...
- Sources: 4

people/elias-stravik.md
- Links / sources: ...
- Focus: ...
- Working preferences: ...

Sources to save
- Official website: https://example.com
- Internal sales deck, provided during setup. Link not committed.

Omitted/redacted
- 1 signed/tokenized link omitted for safety

workspaces/default/context.md
- Offering: ...
- Market: ...
- GTM motion: ...

Options
1. Apply all
2. Edit before applying
3. Apply selected sections
4. Keep sparse templates
5. Add more links/context and retry enrichment
```

Rules:

1. Show the preview before writing any enriched durable context.
2. Group proposed enrichment by target file and section.
3. Include source counts and useful source URLs where they help the user judge the draft, following the source-link persistence rules in ADR 0047 and source-link classification in ADR 0048.
4. Show proposed safe source labels and omitted/redacted source counts before writing them, as defined in ADR 0050.
5. Clearly mark uncertain claims or unresolved questions, and ask the user to resolve important conflicts before writing them as facts.
6. Offer these confirmation options: apply all, edit before applying, apply selected sections, keep sparse templates, or add more links/context and retry enrichment.
7. Treat `Apply all` and selected accepted sections as confirmed setup enrichment.
8. Treat edited-and-accepted sections as confirmed setup enrichment.
9. Treat rejected, skipped, or unselected sections as unconfirmed enrichment and do not write them.
10. If the user chooses to add more links/context and retry, rerun the bounded setup enrichment and show a new preview.
11. If the user keeps sparse templates, write sparse templates only and record enrichment status as proposed-but-not-applied or skipped as appropriate.

ADR 0044 defines how `gtm-setup` handles conflicting or unclear source claims during enrichment.

ADR 0045 defines that unresolved clarification blocks only the affected optional claim, field, or section, not the whole setup flow.

ADR 0047 defines which confirmed source links are saved in markdown and which links must not be committed.

ADR 0048 defines how setup classifies source links before saving them.

ADR 0049 defines safe labels for omitted sensitive/private links that supported confirmed context.

ADR 0050 defines preview and confirmation behavior for proposed safe source labels.

ADR 0051 defines confirmed source links and safe labels as starting evidence for later skills rather than guaranteed truth.

ADR 0052 defines output provenance requirements when later skills use confirmed source links and safe labels.

## Consequences

- Users retain control over durable context.
- Agents can seed useful context without silently committing unreviewed claims.
- Partial confirmation is supported.
- The initial commit can include exactly the user-approved enrichment.
