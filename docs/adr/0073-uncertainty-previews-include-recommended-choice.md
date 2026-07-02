# ADR 0073: Uncertainty previews include a recommended choice

## Status

Accepted

## Context

ADR 0072 defines Assistive Uncertainty Previews for mostly nontechnical users. These previews translate material uncertainty into a plain accept/deny moment after the agent has already done safe discovery and chosen safe defaults where possible.

A preview that merely lists facts can still leave the user doing the agent's job: weighing technical risk, interpreting impact, and choosing the safer path. GTM Skills should feel assistive, not like neutral paperwork.

## Decision

Assistive Uncertainty Previews should include the agent's recommended choice by default.

The recommendation should be concise and impact-oriented:

```md
I recommend not pushing yet because this would also publish 2 unrelated commits.

Options:
- No, leave everything local — recommended
- Yes, push these commits
```

Rules:

1. Include a recommended option whenever the agent can identify a safer or clearly better choice.
2. Explain the recommendation in user-facing terms: what will change, publish, remain local, be skipped, or be protected.
3. Keep the user in control; the recommendation does not replace confirmation for side effects.
4. If the best choice depends on business judgment the agent cannot infer, ask one focused question and state the default assumption.
5. Do not present a recommendation with false confidence. If the recommendation is weak, say so plainly.
6. For higher-blast-radius side effects, prefer the safer default unless the user's prior instruction clearly authorizes the broader action.

## Consequences

- Nontechnical users get guidance, not just disclosure.
- Preview moments remain fast enough for SDR/BDR workflows.
- The system can be opinionated while preserving explicit user approval for side effects.
- Implementations need preview rendering to support a recommended option marker or equivalent wording.
