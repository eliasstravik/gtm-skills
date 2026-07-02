---
name: gtm-account-research
description: Research target accounts against the active GTM Workspace's ICP context. Use when a user asks for account research, company research, account briefs, target-account notes, outbound account prep, account qualification research, or CSV/table-file bulk account research; composes account segmentation and account scoring when useful before prioritization, routing, or outbound drafting.
metadata:
  function_tags: [sales, marketing, revops, growth]
  role_tags: [sdr, bdr, ae, full-cycle-seller, sales-ops, marketing-ops, cro, vp-sales, founder]
  requires_context: [context, icps]
  composes: [gtm-account-segmentation, gtm-account-scoring]
  output_mode: ephemeral
  supports: [one-off, bulk]
---

# GTM Account Research

Produce company-level research that explains why an account matters for the active GTM Workspace. This skill returns ephemeral account briefs and bulk research tables; it does not edit GTM context, CRM records, outreach, campaigns, files, git history, or remote systems unless the user separately asks for a side effect and confirms the preview.

## Core Workflow

1. Resolve the GTM Context Project.
   - Use explicit prompt context first, then the nearest current-directory ancestor containing `gtm.yaml`, then `$GTM_HOME/registry.json`; default `$GTM_HOME` to `~/.gtm`.
   - Resolve the active Person and GTM Workspace from the prompt, registry local state, then `gtm.yaml` `default_workspace`.
   - Read `organization.md`, `people/<person-id>.md`, `workspaces/<workspace-id>/context.md`, and `workspaces/<workspace-id>/icps.md`.
   - Read Business Unit and Team files when the active context chain names them.
   - Read `workspaces/<workspace-id>/scoring.md` when present so account scoring can be composed without making scoring a hard prerequisite.
   - Completion criterion: the project path, active workspace, ICP source path, account input source, and available saved source sections are known, or a blocking failure below has been returned.

2. Enforce hard prerequisites.
   - If no GTM Context Project resolves, stop with the exact missing-context failure in Blocking Rules.
   - If a project resolves but no active or default workspace can be determined, ask the user to choose a workspace or run `gtm-setup` repair.
   - If `workspaces/<workspace-id>/icps.md` is missing, empty, or placeholder-only, stop and route the user to `gtm-define-icp`.
   - Completion criterion: account research is grounded in usable Organization, Person, Workspace, and ICP context.

3. Choose one-off or bulk mode.
   - Use one-off mode for a single company described in the prompt, one website, or one selected account record.
   - Use bulk mode for CSV files, simple markdown tables, pasted tables, or CRM/spreadsheet exports provided as files.
   - Normalize available fields such as account name, website, industry, employee count, region, summary, signals, known gaps, evidence labels, and open questions.
   - Ask one focused clarification only when the account identity is missing; otherwise research with explicit uncertainty.
   - Completion criterion: every account has enough normalized identity and starting evidence to compare against the workspace ICPs or return a low-confidence brief.

4. Build the evidence set.
   - Treat saved Organization, Workspace, Business Unit, and Team source links as starting evidence: look there first, but do not treat them as permanent truth.
   - Distinguish confirmed workspace context, saved source links, safe source labels, newly found evidence, user-provided account data, and unresolved open questions.
   - Use available browser/search tools for current evidence when the runtime and user request allow it; when live research is unavailable or the account is fictional, label account rows or prompt facts as `user-provided-context` and mark any unverifiable claims as open questions.
   - Surface conflicts between saved context and newer evidence instead of silently choosing one.
   - Completion criterion: important claims, risks, disqualifiers, and recommended next steps have source provenance or are explicitly marked as unresolved.

5. Compose account segmentation and scoring when useful.
   - Compose `gtm-account-segmentation` unless the input already includes a valid `segment_label` from `icps.md`.
   - Compose `gtm-account-scoring` when scoring criteria exist or a score is supplied; otherwise skip scoring and say why in the dependency trace.
   - Do not invent new ICP labels. If research reveals a possible new segment, keep it as a durable-context promotion candidate and route any actual ICP change to `gtm-define-icp`.
   - Completion criterion: each account has a segment label when possible, optional score/fit label when scoring is available, and a trace explaining composed or skipped skills.

6. Write the research result.
   - Interpret the account through the active workspace ICPs: relevant business model, likely compliance/GTM pain, timing signals, disqualifiers, likely buying team, personalization angles, and open questions.
   - Set `confidence` to `low`, `medium`, or `high` based on evidence quality, freshness, directness, gaps, conflicts, and whether key claims are only inferred.
   - Set `needs_review: true` for every new low-confidence result and for medium/high-confidence results with material ambiguity, conflicts, sensitive/private-source dependency, possible disqualifiers, or high-priority recommendations backed by weak evidence.
   - Completion criterion: every account has a brief, key signals, pain hypotheses, recommended next step, provenance, confidence, reasoning, review flag, and open questions.

7. Return the result.
   - Include a dependency trace naming the GTM project, workspace, ICP source path, hard prerequisites, composed skills, and skipped skills.
   - For one-off mode, include the output fields in One-Off Output Contract.
   - For bulk mode, include the Bulk Run Summary and compact per-record table/CSV fields in Bulk Output Contract.
   - State that no side effects occurred. If the user asks to export, save, sync, update CRM, send outreach, trigger campaigns, or promote durable learnings, show a summary-first Side-Effect Preview and wait for confirmation before doing it.

## One-Off Output Contract

Use this structure for a single account:

```yaml
dependency_trace:
  gtm_project: <project-id>
  gtm_workspace: <workspace-id>
  hard_prerequisites:
    - workspaces/<workspace-id>/icps.md found
  composed:
    - gtm-account-segmentation
    - gtm-account-scoring
  skipped:
    - <skill and reason, or []>

account_name: <account>
website: <website-or-unknown>
segment_label: <defined-icp-label-or-no-match-or-unknown>
score: <1-100-or-null>
fit_label: not-a-fit|good-fit|great-fit|excellent-fit|null
research_priority: high|medium|low
research_brief: <short account-level brief>
icp_relevance: <why this account matters or does not matter for the active ICPs>
key_signals:
  - <signal>
pain_hypotheses:
  - <hypothesis>
likely_buying_team:
  - <role or team>
risks_disqualifiers:
  - <risk, disqualifier, missing evidence, or "None.">
personalization_angles:
  - <outbound-safe account-level angle>
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

Keep research briefs factual and account-level. Do not imply real customers, live integrations, private data, legal advice, or automated approval claims unless the source evidence explicitly supports them.

## Bulk Output Contract

Start every bulk result with:

```md
## Bulk run summary

Records processed: <count>
Research priority distribution:
- high: <count>
- medium: <count>
- low: <count>
Segment distribution:
- <segment-label>: <count>
- no-match: <count>
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
account_id,account_name,website,segment_label,score,fit_label,research_priority,confidence,needs_review,reasoning,research_brief,key_signals,pain_hypotheses,recommended_next_step,top_evidence,open_questions
```

Use expanded evidence only for selected, high-priority, low-confidence, disputed, or user-requested records so bulk output remains scannable.

## Blocking Rules

- If no GTM Context Project resolves, stop with exactly:

  > I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

- If the active workspace has no usable `icps.md`, stop with:

  > I found a GTM Context Project and active workspace, but this workspace has no usable `workspaces/<workspace-id>/icps.md`. Run `gtm-define-icp` first, then rerun `gtm-account-research`.

- If the input is a malformed CSV/table file, explain the parsing problem and ask for a corrected file or pasted table.
- If saved source links are stale, inaccessible, or contradictory, continue with lower confidence and explicit open questions unless the conflict changes a critical durable-context claim.

## Examples

Read [research-examples.md](references/research-examples.md) when you need a concrete one-off or bulk example using the Northstar Compliance fixture.

## Verification Checklist

- `workspaces/<workspace-id>/icps.md` was read before research.
- Saved Organization, Workspace, Business Unit, and Team sources were treated as starting evidence, not guaranteed truth.
- `gtm-account-segmentation` was used or a valid segment label was supplied; `gtm-account-scoring` was used when scoring criteria were available or explicitly supplied.
- Every output account has a research brief, key signals, pain hypotheses, recommended next step, `confidence`, `reasoning`, `needs_review`, source provenance, and open questions.
- Evidence uses the ADR 0053 source types and does not expose sensitive URLs or private source details.
- Bulk outputs include the run-level summary plus compact per-record provenance.
- Low-confidence results start with `needs_review: true`.
- No CRM update, outreach, campaign trigger, sync, durable context write, git commit, or remote push happened unless separately previewed and confirmed.
