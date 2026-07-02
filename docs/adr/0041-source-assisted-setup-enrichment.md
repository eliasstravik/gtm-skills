# ADR 0041: `gtm-setup` supports source-assisted enrichment with user confirmation

## Status

Accepted

## Context

Earlier setup decisions keep required fields minimal and generate sparse markdown templates. That keeps setup fast, but a sparse context repo is less useful than one seeded from trustworthy sources.

The user should not have to manually fill long intake forms for positioning, proof points, offerings, market, goals, or responsibilities. Instead, setup should ask for useful source links, let the agent research and draft the best initial context it can, then ask the user to confirm, correct, or add anything before durable context is written.

## Decision

`gtm-setup` should include an optional source-assisted enrichment step.

After required setup inputs are collected, ask for source links and lightweight context such as:

- Organization website
- Product pages
- Docs or help center
- Case studies / customers / proof pages
- LinkedIn company page
- Crunchbase / funding / directory pages
- CRM/account pages or internal docs, if available to the agent
- Active Person's LinkedIn, X/Twitter, personal site, GitHub, calendar/about page, or other user-approved profile links
- Any quick note the user wants the agent to know

Rules:

1. Source links are optional; setup must still work if the user skips them.
2. Do not ask the user to manually fill every markdown section during setup.
3. Use the provided sources, plus permitted public research where available, to draft organization, person, business-unit, team, and workspace context.
4. Keep source-assisted research bounded and setup-oriented; this is not a full account-research run.
5. Show the proposed durable context to the user before writing it.
6. Ask the user to confirm, edit, add context, or keep sparse templates.
7. Only write enriched durable context after user confirmation.
8. Preserve confirmed source URLs in the relevant `Website / sources`, `Links / sources`, or notes sections when useful, subject to the source-link safety policy in ADR 0048.
9. When important source claims are conflicting or unclear, ask the user for clarification before writing them as facts.
10. Never ask for secrets or credentials as setup-source inputs.
11. If research tools or source access are unavailable, keep sparse templates and explain that enrichment was skipped.

Confirmed enrichment is included in the initial setup commit. If enrichment is skipped, unavailable, proposed-but-not-applied, or not confirmed, the initial commit includes sparse templates only. ADR 0042 defines this commit behavior.

ADR 0043 defines the section-by-section preview and confirmation options used before writing source-assisted enrichment.

ADR 0044 defines how `gtm-setup` should ask the user to resolve conflicting or unclear source claims.

ADR 0045 defines that unresolved clarification is non-blocking for setup and blocks only the affected optional claim, field, or section.

ADR 0046 defines source links and source-assisted follow-up prompts as optional enrichment questions, not required setup questions.

ADR 0047 defines which source links are saved as durable markdown context and which links must not be committed.

ADR 0048 defines how setup classifies source links before saving them.

ADR 0049 defines safe labels for omitted sensitive/private links that supported confirmed context.

ADR 0050 defines how proposed safe labels appear in the enrichment preview before being written.

ADR 0051 defines confirmed source links as starting evidence for later skills rather than guaranteed truth.

The setup experience should therefore be:

```text
required fields → source links → agent drafts context → user confirms/edits → write scaffold/enriched files → commit → setup summary
```

This changes the earlier framing from “do not fill templates during setup” to:

> Do not require long manual intake, but do offer source-assisted enrichment and confirmation.

## Consequences

- Setup remains lightweight for users who want to skip enrichment.
- Users who provide links get a much more useful first context repo.
- The agent can seed durable context from sources instead of making the user type everything manually.
- User confirmation protects against hallucinated or incorrect durable context.
- Source links make later updates and audits easier.
