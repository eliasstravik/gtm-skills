# ADR 0081: `gtm-setup` fast path has a hard three-interaction budget

## Status

Accepted

Supersedes ADR 0023.

## Context

The setup-related ADRs individually mandate a depth question (0023), ID confirmation/override for organization, person, and workspace (0024–0026), the required-vs-enrichment question split (0046), source-link collection and classification (0041, 0048), a section-by-section enrichment preview (0043), clarification loops (0044), and a commit preview (0068). Each is defensible alone; composed naively they produce a 10+ prompt interrogation. The MVP wedge user is an SDR, and SDRs abandon tools over friction measured in seconds. No ADR previously constrained the sum.

## Decision

The `gtm-setup` simple path takes at most **three user interactions** to reach a working workspace:

1. Organization name.
2. Who are you — display name and free-text role in one question.
3. One optional enrichment prompt: "paste any links about your company, product, or you — or skip."

Supporting rules:

- **Setup depth defaults to simple silently.** `gtm-setup` does not ask the ADR 0023 depth question. The setup summary states that a default workspace was created and that business units, teams, and additional workspaces can be added later. This applies ADR 0072's principle: choose the safe/obvious default instead of asking nontechnical users to decide. Users who name a business unit or team unprompted still get the deeper chain from ADR 0023's behavior table.
- **All generated IDs are shown in one combined confirmation** (organization, person, workspace), accepted with a single response or edited selectively. This satisfies the show-and-allow-override intent of ADRs 0024–0026 without three sequential round trips.
- Enrichment preview, clarification, and classification steps exist only when links were actually provided (ADRs 0041–0050 are otherwise skipped, per ADR 0046).
- The budget is a quantitative eval assertion (ADR 0080): a simple-path setup transcript contains at most three user prompts before the setup summary.

## Consequences

- ADR 0023 is superseded; its depth options survive as opt-in behavior rather than a mandatory question.
- Setup friction is testable, not aspirational.
- Enrichment-heavy setups may legitimately exceed three interactions once the user opts in by pasting links; the budget governs the default path only.
