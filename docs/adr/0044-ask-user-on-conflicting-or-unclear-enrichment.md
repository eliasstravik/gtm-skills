# ADR 0044: Ask the user when source-assisted setup enrichment is conflicting or unclear

## Status

Accepted

## Context

ADR 0041 defines source-assisted setup enrichment. ADR 0043 defines the confirmation preview before enriched durable context is written.

During enrichment, sources may conflict or fail to provide enough clarity. Examples include inconsistent company size, unclear target market, ambiguous product positioning, uncertain team scope, stale social profiles, or multiple possible interpretations of a person's role.

These ambiguities can materially affect GTM context, scoring, segmentation, and later recommendations. Merely burying conflicts in notes is not enough when setup is interactive and the user is available.

## Decision

If source-assisted setup enrichment finds conflicting or unclear information, `gtm-setup` should ask the user for clarification before writing that claim into durable context.

Rules:

1. Do not write conflicting or unclear claims as facts.
2. Ask the user a focused clarification question when a claim is important to the context.
3. Show the conflicting/unclear evidence briefly, with sources when useful.
4. Let the user choose one interpretation, provide a correction, mark it as unknown, or skip the field.
5. If the user resolves the ambiguity, write the confirmed answer as durable context.
6. If the user does not resolve it, keep the field out of factual sections and either leave it blank or record it as an open question.
7. Claims that affect GTM decisions heavily — ICP, market, motion, pricing, compliance, proof points, segmentation, or scoring — require user clarification when unclear.
8. Avoid turning setup into a long interrogation: group related ambiguities and ask only for decisions that materially improve the context.
9. Never invent missing facts to make the context feel complete.

ADR 0045 defines that unresolved enrichment clarification blocks only the affected optional claim, field, or section, not the whole setup.

ADR 0046 defines these clarification prompts as enrichment questions unless they are needed for the minimum valid setup chain.

Example clarification:

```text
I found conflicting company-size signals:

- LinkedIn suggests 51–200 employees.
- The website team page suggests a much smaller core team.

Which should I use for durable setup context?

Options:
1. 51–200 employees
2. Smaller core team
3. Leave company size unknown
4. Use this instead: ...
```

If unresolved, write something like:

```md
## Notes / open questions

- Company size is unclear. LinkedIn suggests 51–200 employees, while the website team page suggests a smaller core team. Confirm before using this in scoring.
```

## Consequences

- Durable setup context stays user-confirmed when evidence is ambiguous.
- Agents avoid encoding uncertain claims as facts.
- Setup remains source-assisted but user-governed.
- Later scoring and segmentation are less likely to rely on bad assumptions.
