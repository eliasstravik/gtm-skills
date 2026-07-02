# ADR 0077: MVP bulk mode uses CSV and table files

## Status

Accepted

## Context

ADR 0005 requires MVP research, scoring, and segmentation skills to support both one-off and bulk modes. ADRs 0054 and 0055 define compact per-record provenance and run-level summaries for bulk outputs.

Bulk support should be real enough for SDR/BDR list workflows, but native integrations with CRMs, spreadsheets, enrichment providers, and other external systems would add authentication, permissions, sync semantics, rate limits, and side-effect risk before the core skill quality is proven.

## Decision

The MVP minimum for bulk mode is CSV/table-file bulk only.

Bulk-capable MVP skills must support:

1. CSV files.
2. Simple markdown tables.
3. Copied or exported tabular data where practical.
4. CRM, spreadsheet, Airtable, or other system exports when they are provided as files or pasted tables.

Bulk-capable MVP skills must not require native integrations with Salesforce, HubSpot, Google Sheets, Airtable, enrichment APIs, or similar systems. Native integrations can come later after the portable skill workflows and output contracts are proven.

Bulk outputs should be CSV/table-friendly by default and include:

- a concise run-level summary;
- per-record result fields;
- compact provenance per record;
- `confidence`, `reasoning`, and `needs_review` per record where the skill produces research, scoring, or segmentation results;
- expanded evidence only for selected, high-priority, low-confidence, disputed, or user-requested records.

## Consequences

- Bulk mode remains useful for real SDR/BDR list workflows.
- The MVP avoids integration/auth/sync complexity.
- Skills can process exports from CRMs and spreadsheets without owning those systems yet.
- Future native integrations can reuse the same bulk output contract rather than redefining result semantics.
