# ADR 0025: Auto-generate Person IDs with user override

## Status

Accepted

## Context

Person records need stable IDs for `gtm.yaml` keys and file paths under `people/`. Display names are not unique, especially in enterprise teams. The system must support multiple people with the same name while keeping references stable and human-readable.

## Decision

`gtm-setup` should auto-generate a readable stable Person ID and allow the user to override it before writing.

Default examples:

```text
elias-stravik
jane-doe
jane-doe-acme-com
jane-doe-2
```

Generation rules:

1. Slugify display name as lowercase kebab-case.
2. If an email is available, use it as a disambiguator when useful.
3. If the display-name slug collides, append a disambiguator:
   - email-derived suffix,
   - username,
   - employee ID,
   - or numeric suffix.
4. Show the generated Person ID to the user and allow override before writing.
5. Once written, treat the Person ID as stable; changing it later should be an explicit rename/migration operation.

Examples:

```yaml
people:
  jane-doe-acme-com:
    display_name: Jane Doe
    email: jane.doe@acme.com
    role: SDR
    default_workspace: cloud-smb-sdr
    path: people/jane-doe-acme-com.md

  jane-doe-2:
    display_name: Jane Doe
    role: AE
    default_workspace: enterprise-ae
    path: people/jane-doe-2.md
```

## Consequences

- Duplicate display names are supported.
- Person references remain stable and readable.
- Setup remains user-friendly because IDs are suggested, not manually required.
