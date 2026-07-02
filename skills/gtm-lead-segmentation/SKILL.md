---
name: gtm-lead-segmentation
description: Segment leads and contacts into the active GTM Workspace's defined persona labels or no-match. Use when a user asks to classify, segment, bucket, route, or qualify people against personas; provides one-off and CSV/table-file bulk lead segmentation before lead scoring, lead research, routing, or outbound prioritization.
metadata:
  function_tags: [sales, marketing, revops, growth]
  role_tags: [sdr, bdr, ae, full-cycle-seller, sales-ops, marketing-ops, cro, vp-sales, founder]
  requires_context: [context, personas]
  composes: []
  output_mode: ephemeral
  supports: [one-off, bulk]
---

# GTM Lead Segmentation

Classify lead or contact records into exactly one Persona segment from the active workspace's `personas.md`, or the canonical `no-match` label when no persona fits. This skill produces ephemeral segmentation outputs; it does not edit GTM context, CRM records, outreach, campaigns, or files unless the user separately asks for an export and confirms the side-effect preview.

## Core Workflow

1. Resolve the GTM Context Project.
   - Use explicit prompt context first, then the nearest current-directory ancestor containing `gtm.yaml`, then `$GTM_HOME/registry.json`; default `$GTM_HOME` to `~/.gtm`.
   - Resolve the active Person and GTM Workspace from the prompt, registry local state, then `gtm.yaml` `default_workspace`.
   - Read `organization.md`, `people/<person-id>.md`, `workspaces/<workspace-id>/context.md`, and `workspaces/<workspace-id>/personas.md`.
   - Completion criterion: the project path, active workspace, persona source path, and lead input source are known, or a blocking failure below has been returned.

2. Enforce hard prerequisites.
   - If no GTM Context Project resolves, stop with the exact missing-context failure in Blocking Rules.
   - If a project resolves but no active or default workspace can be determined, ask the user to choose a workspace or run `gtm-setup` repair.
   - If `workspaces/<workspace-id>/personas.md` is missing, empty, or placeholder-only, stop and route the user to `gtm-define-personas`.
   - Completion criterion: lead segmentation is grounded in usable workspace context and persona definitions.

3. Choose one-off or bulk mode.
   - Use one-off mode for a single lead described in the prompt or one selected record.
   - Use bulk mode for CSV files, simple markdown tables, pasted tables, or CRM/spreadsheet exports provided as files.
   - Normalize available fields such as lead id, account id, account name, lead name, title, department, seniority, region, persona signal, account segment, known gaps, evidence labels, and open questions.
   - Ask one focused clarification only when the person identity or core role evidence is missing; otherwise segment with explicit uncertainty.
   - Completion criterion: each lead record has enough normalized evidence to compare against the persona definitions or return `no-match`.

4. Assign the persona.
   - Compare the lead evidence to the active workspace's persona titles, responsibilities, pains, outreach hooks, disqualifiers, and `no-match` guidance.
   - Assign one machine-readable `persona_label` from `personas.md`; never invent a new label inside segmentation output.
   - Use `no-match` when the lead lacks evidence for all defined personas, sits outside the workspace's relevant buying committee, or is attached to a known non-fit account without a special user-supplied reason.
   - Set `confidence` to `low`, `medium`, or `high` based on evidence quality, freshness, directness, gaps, and conflicts.
   - Set `needs_review: true` for every new low-confidence result and for medium/high-confidence results with material ambiguity, conflicts, sensitive/private-source dependency, unclear buying authority, interim/consulting status, or a possible disqualifier.
   - Completion criterion: every lead has a persona label, confidence, reasoning, review flag, source provenance, and open questions.

5. Return the result.
   - Include a dependency trace naming the GTM project, workspace, persona source path, hard prerequisites, and composed skills skipped.
   - For one-off mode, include the output fields in One-Off Output Contract.
   - For bulk mode, include the Bulk Run Summary and compact per-record table/CSV fields in Bulk Output Contract.
   - State that no side effects occurred. If the user asks to export, save, sync, update CRM, trigger outreach, or write durable context, show a summary-first Side-Effect Preview and wait for confirmation before doing it.

## One-Off Output Contract

Use this structure for a single lead:

```yaml
lead_name: <person>
account_name: <account when known>
persona_label: <defined-persona-label-or-no-match>
persona_name: <human persona name when available>
confidence: low|medium|high
needs_review: true|false
reasoning: >
  Short paragraph explaining the label and the confidence level, including the review trigger when needs_review is true.
evidence:
  - claim: <criterion, signal, risk, disqualifier, or decision>
    source: <safe source label or context file>
    type: workspace-context|saved-source-link|safe-source-label|newly-found-evidence|user-provided-context|open-question
    freshness: current|recent|stale|unknown|not-refetchable
    confidence: low|medium|high
open_questions:
  - <question or "None.">
```

For `no-match`, make the non-fit explicit and state that lead scoring must return `not-a-fit` and cannot exceed 49 unless the persona definitions are changed.

## Bulk Output Contract

Start every bulk result with:

```md
## Bulk run summary

Records processed: <count>
Persona distribution:
- <persona-label>: <count>
- no-match: <count>
Low-confidence records: <count>
Records with open questions: <count>
Records needing human review: <count>

Top evidence patterns:
- <pattern>

Common open questions:
- <question>
```

Then provide a compact per-record table or CSV with at least:

```text
lead_id,account_id,account_name,lead_name,persona_label,confidence,needs_review,reasoning,top_evidence,open_questions
```

Use expanded evidence only for selected, high-priority, low-confidence, disputed, or user-requested records so bulk output remains scannable.

## Blocking Rules

- If no GTM Context Project resolves, stop with exactly:

  > I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

- If the active workspace has no usable `personas.md`, stop with:

  > I found a GTM Context Project and active workspace, but this workspace has no usable `workspaces/<workspace-id>/personas.md`. Run `gtm-define-personas` first, then rerun `gtm-lead-segmentation`.

- If the input is a malformed CSV/table file, explain the parsing problem and ask for a corrected file or pasted table.
- Do not silently create new persona labels. If the user wants a new persona, route them to `gtm-define-personas`.

## Examples

Read [segmentation-examples.md](references/segmentation-examples.md) when you need a concrete one-off or bulk example using the Northstar Compliance fixture.

## Verification Checklist

- `workspaces/<workspace-id>/personas.md` was read before segmentation.
- Every output lead has `persona_label`, `confidence`, `reasoning`, `needs_review`, source provenance, and open questions.
- `no-match` uses the exact machine label `no-match`.
- Bulk outputs include the run-level summary plus compact per-record provenance.
- Low-confidence results start with `needs_review: true`.
- No CRM update, outreach, campaign trigger, sync, durable context write, git commit, or remote push happened unless separately previewed and confirmed.
