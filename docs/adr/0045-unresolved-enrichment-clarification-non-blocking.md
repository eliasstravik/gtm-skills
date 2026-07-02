# ADR 0045: Unresolved enrichment clarifications do not block setup

## Status

Accepted

## Context

ADR 0044 says `gtm-setup` should ask the user when source-assisted enrichment finds conflicting or unclear information. Some users may not know the answer yet, may not want to decide during setup, or may prefer to leave a claim unknown until later.

Setup still needs to produce a usable GTM Context Project. Unresolved optional enrichment should not prevent the repo, active local state, or initial commit from being created.

This decision applies to source-assisted enrichment claims and optional context. It does not remove hard setup requirements such as Organization ID/display name, identified Person, default Workspace, and the minimum full context chain.

ADR 0046 defines the distinction between required setup questions and optional enrichment questions.

## Decision

Unresolved source-assisted enrichment clarification should block only the affected claim or section, not the whole setup.

If the user does not resolve a conflicting or unclear enrichment claim:

- do not write that claim as fact;
- leave the affected field/section blank, sparse, or marked as an open question;
- continue setup with the confirmed context;
- create the initial commit with confirmed context only;
- report unresolved clarification(s) in the setup summary.

Example final behavior:

```text
Organization created.
Workspace created.
Company size unresolved → left as open question.
Initial commit created with confirmed context only.
```

Rules:

1. Required setup fields and hard context prerequisites still block setup when missing.
2. Optional enrichment conflicts block only the affected claim, field, or section.
3. Never silently choose between conflicting claims just to complete setup.
4. If unresolved ambiguity matters later, record it as an open question with brief source context.
5. Continue writing sparse templates and confirmed enrichment for all unaffected sections.
6. Include only confirmed enrichment in the initial commit.
7. Report unresolved clarification count or examples in the setup summary.
8. Later enrichment, research, or definition skills may revisit unresolved open questions.

## Consequences

- Setup remains robust and does not stall on optional unknowns.
- Durable context avoids unconfirmed claims.
- Users get a usable project plus a clear list of unresolved questions.
- Later GTM work can improve the context incrementally.
