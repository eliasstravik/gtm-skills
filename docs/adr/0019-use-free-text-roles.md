# ADR 0019: Use free-text roles for Person records

## Status

Accepted

## Context

Person records require a `role` field so skills can tailor outputs to the user's responsibilities and operating context. A controlled role vocabulary would make downstream grouping easier, but GTM titles vary widely by company, seniority, region, and motion.

Examples that should all work without schema friction:

- SDR
- Enterprise AE
- Founding Account Executive
- Strategic Accounts Lead
- GTM Engineer
- RevOps Analyst
- Partner Manager, EMEA

AI agents can interpret these titles well enough for MVP behavior, especially when combined with Person context, Team context, Workspace context, and optional focus/territory/goals fields.

## Decision

Use a free-text `role` field. Do not require a controlled role enum and do not add `role_custom`.

Example:

```yaml
people:
  jane-doe-acme-com:
    display_name: Jane Doe
    role: Strategic Accounts Lead
    default_workspace: enterprise-ae
    path: people/jane-doe-acme-com.md
```

Rules:

1. `role` is required for a Person record.
2. `role` is free text.
3. Skills should interpret `role` semantically in combination with the Person's workspace, team, focus, territory, goals, and task.
4. Future recommendation/indexing systems may derive normalized role tags from free-text roles, but those derived tags should not replace the source `role` field.

## Consequences

- Setup is simpler and less brittle.
- Unusual or company-specific GTM roles are supported.
- Recommendation systems may need normalization later, but that can be derived rather than forced during setup.
