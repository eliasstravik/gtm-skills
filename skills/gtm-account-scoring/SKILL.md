---
name: gtm-account-scoring
description: Score account fit and timing after GTM account segmentation. Use when a user asks to rank, prioritize, score, qualify, grade, or decide next actions for accounts against ICPs; supports one-off and CSV/table-file bulk account scoring after gtm-account-segmentation, account research, routing, or outbound prioritization.
metadata:
  function_tags: [sales, marketing, revops, growth]
  role_tags: [sdr, bdr, ae, full-cycle-seller, sales-ops, marketing-ops, cro, vp-sales, founder]
  requires_context: [context, icps]
  composes: [gtm-account-segmentation]
  output_mode: mixed
  supports: [one-off, bulk]
---

# GTM Account Scoring

Score account fit and timing against the active workspace's ICPs and scoring criteria. Normal scoring output is ephemeral: it ranks and explains accounts without editing GTM context, CRM records, outreach, campaigns, or files. The only durable branch this skill owns is a confirmed create/update of `workspaces/<workspace-id>/scoring.md` when account scoring criteria are missing or stale.

## Core Workflow

1. Resolve the GTM Context Project.
   - Use explicit prompt context first, then the nearest current-directory ancestor containing `gtm.yaml`, then `$GTM_HOME/registry.json`; default `$GTM_HOME` to `~/.gtm`.
   - Resolve the active Person and GTM Workspace from the prompt, registry local state, then `gtm.yaml` `default_workspace`.
   - Read `organization.md`, `people/<person-id>.md`, `workspaces/<workspace-id>/context.md`, `workspaces/<workspace-id>/icps.md`, and `workspaces/<workspace-id>/scoring.md` when present.
   - Completion criterion: the project path, active workspace, ICP source path, account input source, and either usable scoring criteria or the missing-criteria preview path are known.

2. Enforce hard prerequisites.
   - If no GTM Context Project resolves, stop with the exact missing-context failure in Blocking Rules.
   - If a project resolves but no active or default workspace can be determined, ask the user to choose a workspace or run `gtm-setup` repair.
   - If `workspaces/<workspace-id>/icps.md` is missing, empty, or placeholder-only, stop and route the user to `gtm-define-icp`.
   - If account scoring criteria are missing, empty, or clearly placeholder-only, do not silently invent a scoring model. Draft a concise scoring criteria proposal from `icps.md`, workspace context, and the ADR 0006 fit bands; show the Missing Criteria Preview; wait for explicit confirmation before creating or updating `workspaces/<workspace-id>/scoring.md`.
   - Completion criterion: account scoring is grounded in usable context, ICP definitions, and confirmed or existing scoring criteria.

3. Establish account segmentation.
   - Use a provided `segment_label` only when it is clearly the output of `gtm-account-segmentation` or exactly matches a workspace ICP machine label.
   - If no segment is provided, compose `gtm-account-segmentation` first for the same one-off account or bulk input, then score from its `segment_label`, confidence, reasoning, provenance, and open questions.
   - Never invent new ICP labels in scoring output. If the user wants a new account segment, route to `gtm-define-icp`.
   - Completion criterion: every account has one segment label, including `no-match` when no defined ICP matches.

4. Score fit and timing.
   - Use the scoring criteria in `scoring.md` plus the account's segment, evidence, open questions, and disqualifiers.
   - Use a 1-100 `score` with fit labels:
     - `1-49`: `not-a-fit`
     - `50-74`: `good-fit`
     - `75-89`: `great-fit`
     - `90-100`: `excellent-fit`
   - If `segment_label: no-match`, return `fit_label: not-a-fit` and cap `score` at 49 no matter how interesting the account looks.
   - Set `confidence` to `low`, `medium`, or `high` based on evidence quality, freshness, directness, gaps, and conflicts.
   - Set `needs_review: true` for every new low-confidence result and for medium/high-confidence results with material ambiguity, conflicts, sensitive/private-source dependency, a possible disqualifier, or a high score supported by weak evidence.
   - Completion criterion: every account has score, fit label, evidence summary, positives, risks/disqualifiers, recommended action, provenance, confidence, reasoning, review flag, and open questions.

5. Return the result.
   - Include a dependency trace naming the GTM project, workspace, ICP source path, scoring source path, hard prerequisites, and whether `gtm-account-segmentation` was composed or supplied.
   - For one-off mode, include the output fields in One-Off Output Contract.
   - For bulk mode, include the Bulk Run Summary and compact per-record table/CSV fields in Bulk Output Contract.
   - State that no side effects occurred for normal scoring output. If the user asks to export, save, sync, update CRM, trigger outreach, write durable context, or change scoring criteria, show a summary-first Side-Effect Preview and wait for confirmation before doing it.

## Missing Criteria Preview

When scoring criteria are missing or placeholder-only, show a preview like this and stop until the user confirms:

```md
About to update GTM context:
- workspaces/<workspace-id>/scoring.md - create account scoring criteria
- Basis: workspace context, workspaces/<workspace-id>/icps.md, ADR 0006 fit bands
- Sections: Fit labels, Account scoring model, Required result fields

Will create git commit:
Create account scoring criteria

No account scores will be finalized until these criteria are confirmed.
No outreach will be sent.
No CRM records will be updated.
No campaign triggers, syncs, or remote push will happen.

Proceed?
```

After confirmation, write only `workspaces/<workspace-id>/scoring.md`, stage only that file, auto-commit when the change is isolated, never push by default, and return an ephemeral execution summary with changed file, commit status/hash or skip reason, and external side effects not performed.

## One-Off Output Contract

Use this structure for a single account:

```yaml
dependency_trace:
  gtm_project: <project-id>
  gtm_workspace: <workspace-id>
  hard_prerequisites:
    - workspaces/<workspace-id>/icps.md found
    - workspaces/<workspace-id>/scoring.md found|confirmed
  composed:
    - gtm-account-segmentation
  skipped: []

account_name: <account>
segment_label: <defined-icp-label-or-no-match>
score: <1-100>
fit_label: not-a-fit|good-fit|great-fit|excellent-fit
evidence_summary: <one sentence naming the strongest score drivers>
positives:
  - <fit, timing, pain, or evidence-quality positive>
risks_disqualifiers:
  - <risk, disqualifier, missing evidence, or "None.">
recommended_action: <skip, nurture, research next, prioritize outreach, or review before action>
confidence: low|medium|high
needs_review: true|false
reasoning: >
  Short paragraph explaining the score, fit label, confidence, and review trigger when needs_review is true.
evidence:
  - claim: <score driver, criterion, risk, disqualifier, or decision>
    source: <safe source label or context file>
    type: workspace-context|saved-source-link|safe-source-label|newly-found-evidence|user-provided-context|open-question
    freshness: current|recent|stale|unknown|not-refetchable
    confidence: low|medium|high
open_questions:
  - <question or "None.">
```

## Bulk Output Contract

Start every bulk result with:

```md
## Bulk run summary

Records processed: <count>
Fit distribution:
- excellent-fit: <count>
- great-fit: <count>
- good-fit: <count>
- not-a-fit: <count>
Low-confidence records: <count>
Records with open questions: <count>
Records needing human review: <count>

Top evidence patterns:
- <pattern>

Common risks or disqualifiers:
- <risk>

Common open questions:
- <question>
```

Then provide a compact per-record table or CSV with at least:

```text
account_id,account_name,segment_label,score,fit_label,confidence,needs_review,reasoning,evidence_summary,positives,risks_disqualifiers,recommended_action,top_evidence,open_questions
```

Use expanded evidence only for selected, high-priority, low-confidence, disputed, or user-requested records so bulk output remains scannable.

## Blocking Rules

- If no GTM Context Project resolves, stop with exactly:

  > I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

- If the active workspace has no usable `icps.md`, stop with:

  > I found a GTM Context Project and active workspace, but this workspace has no usable `workspaces/<workspace-id>/icps.md`. Run `gtm-define-icp` first, then rerun `gtm-account-scoring`.

- If account scoring criteria are missing, show the Missing Criteria Preview and wait for confirmation before creating or updating `scoring.md`.
- If the input is a malformed CSV/table file, explain the parsing problem and ask for a corrected file or pasted table.
- If `gtm-account-segmentation` returns `no-match`, do not negotiate the cap: return `not-a-fit` with `score <= 49`.

## Examples

Read [scoring-examples.md](references/scoring-examples.md) when you need a concrete one-off, bulk, or missing-criteria example using the Northstar Compliance fixture.

## Verification Checklist

- `workspaces/<workspace-id>/icps.md` and usable scoring criteria were read or explicitly confirmed before scoring.
- `gtm-account-segmentation` was used or a valid segment label was supplied, and the dependency trace says which happened.
- Every output account has `score`, `fit_label`, `evidence_summary`, positives, risks/disqualifiers, recommended action, `confidence`, `reasoning`, `needs_review`, source provenance, and open questions.
- `no-match` always produces `fit_label: not-a-fit` and `score <= 49`.
- Bulk outputs include the run-level summary plus compact per-record provenance.
- Low-confidence results start with `needs_review: true`.
- No CRM update, outreach, campaign trigger, sync, durable context write, git commit, or remote push happened unless separately previewed and confirmed.
