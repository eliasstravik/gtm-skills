# ADR 0005: MVP skill bundle includes setup, ICP/persona, research, scoring, and segmentation

## Status

Accepted

## Context

The MVP focuses on SDR / BDR workflows. The first bundle should create enough foundation for an agent to understand the seller's GTM context, classify accounts and leads, research them, and evaluate whether they are worth pursuing.

The bundle should not start with a generic cold-email skill because many comparable skills already exist. The differentiator is durable context plus research, scoring, and segmentation that can later feed outreach.

The same skills need to work for both a single account/lead and bulk CSV/table-file sources such as CSVs, simple markdown tables, copied tabular data, or CRM/spreadsheet exports provided as files.

## Decision

The MVP installable bundle will include nine skills. ADR 0074 defines that implementation should start with the shared foundation slice before downstream workflow skills.

ADR 0075 defines that the MVP package target is portable Agent Skills first, with optional helper scripts and no required custom global CLI.

ADR 0076 defines the MVP skill definition of done, following `/skill-creator` and `/writing-great-skills` best practices.

ADR 0077 defines the MVP bulk-mode minimum: CSV/table-file bulk only, with native CRM and spreadsheet integrations deferred.

ADR 0078 defines the canonical fictional Northstar Compliance demo fixture for examples and verification.

1. `gtm-setup` — create/select `~/.gtm/<project>`, build an in-memory setup model, initialize git, write/update `~/.gtm/registry.json`, scaffold the core organization/person/workspace files (`.gitignore`, `AGENTS.md`, `CLAUDE.md`, `gtm.yaml`, `organization.md`, `business-units/`, `teams/`, `people/<person-id>.md`, `workspaces/default/context.md`) in deterministic order, and create an initial commit by default after successful setup.
2. `define-icp` — define and update ideal account segments in the active workspace's `icps.md`.
3. `define-personas` — define and update personas in the active workspace's `personas.md`.
4. `account-research` — produce ephemeral company-level account research using the selected GTM Context Project, including saved source links as starting evidence where available.
5. `lead-research` — produce ephemeral person-level lead research using selected ICP/persona context and saved Person/profile source links as starting evidence where available.
6. `account-scoring` — score account fit and timing using the active workspace's `icps.md` and `scoring.md`, while treating saved source links as starting evidence rather than guaranteed truth.
7. `lead-scoring` — score person relevance and outreach priority using the active workspace's `personas.md` and `scoring.md`, while treating saved source links as starting evidence rather than guaranteed truth.
8. `account-segmentation` — classify accounts into defined ICP segments, or a non-fit / neither bucket.
9. `lead-segmentation` — classify people into defined personas, or a non-fit / neither bucket.

Research, scoring, and segmentation skills should cite source provenance for important claims and decisions, as defined in ADR 0052, using the lightweight provenance-entry format in ADR 0053.

The research, scoring, and segmentation skills must support both:

- **One-off mode:** process a single account, lead, or record.
- **Bulk mode:** process many records from CSV files, simple markdown tables, copied/exported tabular data, or CRM/spreadsheet exports provided as files. Native CRM, spreadsheet, Airtable, enrichment-provider, or similar integrations are out of scope for MVP bulk mode.

Bulk mode should split independent records into parallel or batched work where the host agent supports it, while preserving evidence, assumptions, and per-record outputs.

ADR 0054 defines how bulk outputs carry compact per-record provenance: table-like outputs stay scannable with fields such as `top_evidence`, `confidence`, and `open_questions`, while richer outputs can include structured evidence arrays for selected or important records.

ADR 0055 defines the concise run-level summary that every bulk run should include.

ADR 0056 defines standard `confidence`, `reasoning`, and `needs_review` fields for every research, scoring, and segmentation result.

ADR 0057 defines that review explanation belongs in `reasoning`, not a separate `review_reasons` field.

ADR 0058 defines that new unreviewed low-confidence results start with `needs_review: true`.

ADR 0059 defines that `needs_review: true` gates automated downstream actions by default.

ADR 0060 defines that human review clears the gate by updating `needs_review` and `reasoning`, not by adding an override object.

ADR 0061 defines that `needs_review: false` is automation-eligible, not side-effect-authorized.

ADR 0062 keeps automation policy design out of scope for the MVP.

ADR 0063 requires preview and confirmation before MVP side effects execute.

ADR 0064 keeps Side-Effect Previews summary-first for bulk usability.

ADR 0065 requires post-action summaries after confirmed side effects execute.

ADR 0066 keeps post-action summaries ephemeral by default in the MVP.

ADR 0067 defines file/section previews for durable GTM context writes.

ADR 0068 defines auto-commit behavior for commit-safe durable GTM context writes.

ADR 0069 defines non-blocking auto-commit failure behavior for durable GTM context writes.

ADR 0070 defines auto-commit isolation from unrelated working-tree changes.

ADR 0071 defines that GTM context auto-commit does not auto-push by default.

ADR 0072 defines assistive uncertainty previews for mostly nontechnical users.

ADR 0073 defines that uncertainty previews include the agent's recommended choice by default.

## Consequences

- The MVP is useful before adding a full outbound composition skill.
- SDRs and BDRs can run both ad-hoc research and list-level qualification workflows.
- Skills need clear input/output contracts for both one-off and bulk modes.
- Bulk outputs should be ephemeral by default unless the user explicitly promotes durable learnings into the GTM Context Project.
- Future skills such as `research-to-outreach`, `sequence-builder`, or CRM sync can consume the research/scoring/segmentation outputs.
