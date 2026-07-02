---
name: gtm-lead-research
description: Research target leads and contacts against the active GTM Workspace's persona context. Use when a user asks for lead research, contact research, person-level research briefs, outbound lead prep, buying-committee notes, personalization angles, or CSV/table-file bulk lead research; composes lead segmentation, lead scoring, and account research when useful before prioritization, routing, or outbound drafting.
metadata:
  function_tags: [sales, marketing, revops, growth]
  role_tags: [sdr, bdr, ae, full-cycle-seller, sales-ops, marketing-ops, cro, vp-sales, founder]
  requires_context: [context, personas]
  composes: [gtm-lead-segmentation, gtm-lead-scoring, gtm-account-research]
  output_mode: ephemeral
  supports: [one-off, bulk]
---

# GTM Lead Research

Produce person-level research that explains why a lead or contact matters for the active GTM Workspace. This skill returns ephemeral lead briefs and bulk research tables; it does not edit GTM context, CRM records, outreach, campaigns, files, git history, or remote systems unless the user separately asks for a side effect and confirms the preview.

## Core Workflow

1. Resolve the GTM Context Project.
   - Use explicit prompt context first, then the nearest current-directory ancestor containing `gtm.yaml`, then `$GTM_HOME/registry.json`; default `$GTM_HOME` to `~/.gtm`.
   - Resolve the active Person and GTM Workspace from the prompt, registry local state, then `gtm.yaml` `default_workspace`.
   - Read `organization.md`, `people/<person-id>.md`, `workspaces/<workspace-id>/context.md`, and `workspaces/<workspace-id>/personas.md`.
   - Read Business Unit and Team files when the active context chain names them.
   - Read `workspaces/<workspace-id>/scoring.md` and `workspaces/<workspace-id>/icps.md` when present so lead scoring and account research can be composed without making scoring or ICPs hard prerequisites.
   - Completion criterion: the project path, active workspace, persona source path, lead input source, and available saved Person/profile source sections are known, or a blocking failure below has been returned.

2. Enforce hard prerequisites.
   - If no GTM Context Project resolves, stop with the exact missing-context failure in Blocking Rules.
   - If a project resolves but no active or default workspace can be determined, ask the user to choose a workspace or run `gtm-setup` repair.
   - If `workspaces/<workspace-id>/personas.md` is missing, empty, or placeholder-only, stop and route the user to `gtm-define-personas`.
   - Completion criterion: lead research is grounded in usable Organization, active Person, Workspace, and Persona context.

3. Choose one-off or bulk mode.
   - Use one-off mode for a single person described in the prompt, one profile URL, or one selected lead/contact record.
   - Use bulk mode for CSV files, simple markdown tables, pasted tables, or CRM/spreadsheet exports provided as files.
   - Normalize available fields such as lead id, account id, account name, lead name, title, department, seniority, region, persona signal, account segment, score, known gaps, source/profile links, evidence labels, and open questions.
   - Ask one focused clarification only when the person identity or core role evidence is missing; otherwise research with explicit uncertainty.
   - Completion criterion: every lead has enough normalized identity and starting evidence to compare against the workspace personas or return a low-confidence brief.

4. Build the evidence set.
   - Treat saved active Person profile/source links and target lead/profile links from the prompt or input file as starting evidence: look there first, but do not treat them as permanent truth.
   - Distinguish confirmed workspace context, saved source links, safe source labels, newly found evidence, user-provided lead data, and unresolved open questions.
   - Use available browser/search tools for current evidence when the runtime and user request allow it; when live research is unavailable or the lead is fictional, label input rows or prompt facts as `user-provided-context` or `newly-found-evidence` and mark unverifiable claims as open questions.
   - Surface conflicts between saved context and newer evidence instead of silently choosing one.
   - Completion criterion: important role claims, buying-committee judgments, risks, disqualifiers, and personalization recommendations have source provenance or are explicitly marked as unresolved.

5. Compose lead segmentation, lead scoring, and account research when useful.
   - Compose `gtm-lead-segmentation` unless the input already includes a valid `persona_label` from `personas.md`.
   - Compose `gtm-lead-scoring` when scoring criteria exist or a score/fit label is supplied; otherwise skip scoring and say why in the dependency trace.
   - Compose `gtm-account-research` when the lead's account identity and account context materially affect prioritization, pain hypotheses, or personalization.
   - Do not invent new persona labels. If research reveals a possible new persona, keep it as a durable-context promotion candidate and route any actual persona change to `gtm-define-personas`.
   - Completion criterion: each lead has a persona label when possible, optional score/fit label when scoring is available, relevant account context when available, and a trace explaining composed or skipped skills.

6. Write the research result.
   - Interpret the lead through the active workspace personas: role and responsibilities, likely priorities, buying influence, pain proximity, account context, outreach-safe personalization angles, risks/disqualifiers, and open questions.
   - Set `research_priority` to `high`, `medium`, or `low` from persona fit, score/fit label when present, account fit, evidence strength, and review state.
   - Set `confidence` to `low`, `medium`, or `high` based on evidence quality, freshness, directness, gaps, conflicts, and whether key claims are only inferred.
   - Set `needs_review: true` for every new low-confidence result and for medium/high-confidence results with material ambiguity, conflicts, sensitive/private-source dependency, unclear buying authority, interim/consulting status, possible disqualifiers, or high-priority recommendations backed by weak evidence.
   - Completion criterion: every lead has a brief, role relevance, likely priorities, account context, personalization angles, recommended next step, provenance, confidence, reasoning, review flag, and open questions.

7. Return the result.
   - Include a dependency trace naming the GTM project, workspace, persona source path, hard prerequisites, composed skills, and skipped skills.
   - For one-off mode, include the output fields in One-Off Output Contract.
   - For bulk mode, include the Bulk Run Summary and compact per-record table/CSV fields in Bulk Output Contract.
   - State that no side effects occurred. If the user asks to export, save, sync, update CRM, send outreach, trigger campaigns, or promote durable learnings, show a summary-first Side-Effect Preview and wait for confirmation before doing it.

## One-Off Output Contract

Use this structure for a single lead:

```yaml
dependency_trace:
  gtm_project: <project-id>
  gtm_workspace: <workspace-id>
  hard_prerequisites:
    - workspaces/<workspace-id>/personas.md found
  composed:
    - gtm-lead-segmentation
    - gtm-lead-scoring
    - gtm-account-research
  skipped:
    - <skill and reason, or []>

lead_name: <person>
account_name: <account when known>
title: <title-or-unknown>
persona_label: <defined-persona-label-or-no-match-or-unknown>
persona_name: <human persona name when available>
score: <1-100-or-null>
fit_label: not-a-fit|good-fit|great-fit|excellent-fit|null
research_priority: high|medium|low
lead_research_brief: <short person-level brief>
role_relevance: <why this person matters or does not matter for the active personas>
likely_priorities:
  - <priority, pain, or job-to-be-done>
account_context: <how the account changes the lead interpretation, or unknown>
risks_disqualifiers:
  - <risk, disqualifier, missing evidence, or "None.">
personalization_angles:
  - <outbound-safe person-level angle>
recommended_next_step: <skip, nurture, verify, research deeper, prioritize outreach, or review before action>
confidence: low|medium|high
needs_review: true|false
reasoning: >
  Short paragraph explaining the research judgment, confidence, and review trigger when needs_review is true.
evidence:
  - claim: <important claim, signal, risk, disqualifier, or decision>
    source: <safe source label or context file>
    type: workspace-context|saved-source-link|safe-source-label|newly-found-evidence|user-provided-context|open-question
    freshness: current|recent|stale|unknown|not-refetchable
    confidence: low|medium|high
open_questions:
  - <question or "None.">
```

Keep research factual and person-level. Do not imply real employment, private data access, legal advice, automated approval claims, or willingness to buy unless source evidence explicitly supports it.

## Bulk Output Contract

Start every bulk result with:

```md
## Bulk run summary

Records processed: <count>
Research priority distribution:
- high: <count>
- medium: <count>
- low: <count>
Persona distribution:
- <persona-label>: <count>
- no-match: <count>
Fit distribution:
- excellent-fit: <count>
- great-fit: <count>
- good-fit: <count>
- not-a-fit: <count>
Low-confidence records: <count>
Records with open questions: <count>
Records needing human review: <count>

Top signal patterns:
- <pattern>

Common risks or disqualifiers:
- <risk>

Common open questions:
- <question>
```

Then provide a compact per-record table or CSV with at least:

```text
lead_id,account_id,account_name,lead_name,title,persona_label,score,fit_label,research_priority,confidence,needs_review,reasoning,lead_research_brief,role_relevance,likely_priorities,account_context,personalization_angles,recommended_next_step,top_evidence,open_questions
```

Use expanded evidence only for selected, high-priority, low-confidence, disputed, or user-requested records so bulk output remains scannable.

## Blocking Rules

- If no GTM Context Project resolves, stop with exactly:

  > I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

- If the active workspace has no usable `personas.md`, stop with:

  > I found a GTM Context Project and active workspace, but this workspace has no usable `workspaces/<workspace-id>/personas.md`. Run `gtm-define-personas` first, then rerun `gtm-lead-research`.

- If the input is a malformed CSV/table file, explain the parsing problem and ask for a corrected file or pasted table.
- If saved source links are stale, inaccessible, or contradictory, continue with lower confidence and explicit open questions unless the conflict changes a critical durable-context claim.

## Examples

Read [lead-research-examples.md](references/lead-research-examples.md) when you need a concrete one-off or bulk example using the Northstar Compliance fixture.

## Verification Checklist

- `workspaces/<workspace-id>/personas.md` was read before research.
- Saved active Person/profile sources and target lead/profile links were treated as starting evidence, not guaranteed truth.
- `gtm-lead-segmentation` was used or a valid persona label was supplied; `gtm-lead-scoring` and `gtm-account-research` were used when their context was available and relevant.
- Every output lead has a research brief, role relevance, likely priorities, account context, personalization angles, recommended next step, `confidence`, `reasoning`, `needs_review`, source provenance, and open questions.
- Evidence uses the ADR 0053 source types and does not expose sensitive URLs or private source details.
- Bulk outputs include the run-level summary plus compact per-record provenance.
- Low-confidence results start with `needs_review: true`.
- No CRM update, outreach, campaign trigger, sync, durable context write, git commit, or remote push happened unless separately previewed and confirmed.
