# ADR 0001: Start the MVP with SDR / BDR workflows

## Status

Accepted

## Context

The full product vision is a standards-compatible skill library for GTM teams across sales, marketing, revenue operations, customer success, partnerships, and growth. That vision is broad, so the MVP needs a narrower first user and a workflow with immediate daily utility.

The chosen first user is the sales development / business development individual contributor: SDRs and BDRs who prospect, research accounts and leads, qualify fit, and write outbound.

## Decision

The MVP will focus on SDR / BDR workflows before expanding to other GTM functions and sales roles.

The first skill areas are:

1. Product and GTM context setup / scaffolding
2. ICP definition for ideal account segments
3. Persona definition for the ideal people inside each ICP
4. Account research and account scoring
5. Lead research and lead scoring
6. Outbound messaging and sequencing built from the research and scores

## Consequences

- The first release can optimize for a high-frequency, immediately useful workflow: turning a target account or lead into credible research, qualification, and outbound.
- The taxonomy still needs to support the broader GTM vision through function tags and role tags.
- Skills should be composable so later AE, RevOps, marketing, CS, and partnerships workflows can reuse the same context, ICP, account, lead, and scoring primitives.
