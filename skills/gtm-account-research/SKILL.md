---
name: gtm-account-research
description: Research target accounts against the active GTM workspace ICP context. Use when the user asks for company research, account briefs, target-account notes, outbound account prep, qualification research, or bulk account research from CSVs, tables, account lists, or research exports.
---

# GTM Account Research

Produce account-level briefs grounded in workspace ICP context. Normal
output is ephemeral and does not edit GTM context or external systems.

## Core Workflow

1. Resolve the GTM Context Project.
   - Default `$GTM_HOME` to `~/.gtm`.
   - Resolve project by prompt, current-directory `gtm.yaml`, then
     `$GTM_HOME/registry.json`.
   - Resolve workspace by prompt, registry active state, then `gtm.yaml`.
   - Validate resolved ids and paths before any read or output step: project,
     workspace, business-unit, and team ids must be lowercase slug ids; reject
     derived child paths that are absolute, contain `..`, or resolve outside the
     canonical project root, including symlink escapes.
   - Read `organization.md`, workspace `context.md`, `icps.md`, optional
     `account-scoring.md`, and named business-unit/team files when present.
   - Completion criterion: project path, workspace id, ICP source path,
     account input source, and available saved source sections are known.

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
   - Before fetching or echoing saved or prompt-provided source links, classify
     them with `gtm-setup`'s source-link classifier when available. Never fetch
     or print secret-bearing, tokenized, invite, local-only, or private-tunnel
     URLs; require explicit per-run confirmation for private links and use
     redacted safe labels in outputs.
   - Treat saved Organization, Workspace, Business Unit, and Team source links as starting evidence: look there first, but do not treat them as permanent truth.
   - Distinguish confirmed workspace context, saved source links, safe source labels, newly found evidence, user-provided account data, and unresolved open questions.
   - Do not present prompt-provided claims as independently verified live facts. If the user says a public page, CRM field, note, or export says something and you did not fetch or inspect that source in the current run, label it as `user-provided-context`.
   - Use available browser/search tools for current evidence when the runtime and user request allow it; when live research is unavailable or the account is fictional, label account rows or prompt facts as `user-provided-context` and mark any unverifiable claims as open questions.
   - Surface conflicts between saved context and newer evidence instead of silently choosing one.
   - Completion criterion: important claims, risks, disqualifiers, and recommended next steps have source provenance or are explicitly marked as unresolved.

5. Compose account segmentation and scoring when useful.
   - Compose `gtm-account-segmentation` unless the input already includes a valid `segment_label` from `icps.md`.
   - Compose `gtm-account-scoring` when scoring criteria exist or a score is supplied; otherwise skip scoring and say why in the dependency trace.
   - Do not invent new ICP labels. If research reveals a possible new segment, keep it as a durable-context promotion candidate and route any actual ICP change to `gtm-define-icp`.
   - Completion criterion: each account has a segment label when possible, optional score/fit label when scoring is available, and a trace explaining composed or skipped skills.

6. Write the research result.
   - Interpret the account through the active workspace ICPs: relevant business
     model, likely domain-specific/GTM pain, timing signals, disqualifiers,
     likely buying team, personalization angles, and open questions.
   - Set `confidence` to `low`, `medium`, or `high` based on evidence quality, freshness, directness, gaps, conflicts, and whether key claims are only inferred.
   - Set `needs_review: true` for every new low-confidence result and for medium/high-confidence results with material ambiguity, conflicts, sensitive/private-source dependency, possible disqualifiers, or high-priority recommendations backed by weak evidence.
   - Completion criterion: every account has a brief, key signals, pain hypotheses, recommended next step, provenance, confidence, reasoning, review flag, and open questions.

7. Return the result.
   - Include project, workspace, ICP source path, source context files read,
     hard prerequisites, composed skills, and skipped skills.
   - For one-off mode, return account name, website, segment, optional score,
     research priority, brief, ICP relevance, key signals, pain hypotheses,
     likely buying team, risks, personalization angles, recommended next step,
     confidence, review flag, reasoning, evidence, and open questions.
   - For bulk mode, start with priority distribution, segment distribution,
     low-confidence count, review-needed count, top signals, risks, and open
     questions; then return compact per-record fields.
   - State that no side effects occurred, including no CRM updates,
     file/context writes, outreach, exports, syncs, campaign actions, durable
     context promotions, or external calls unless explicitly performed as
     source research and cited. Preview and confirm before export, save, sync,
     CRM update, outreach, campaign action, or durable context promotion.

## Blocking Rules

- If no GTM Context Project resolves, stop with exactly:

  > I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

- If the active workspace has no usable `icps.md`, stop with:

  > I found a GTM Context Project and active workspace, but this workspace has no usable `workspaces/<workspace-id>/icps.md`. Run `gtm-define-icp` first, then rerun `gtm-account-research`.

- If the input is a malformed CSV/table file, explain the parsing problem and ask for a corrected file or pasted table.
- If saved source links are stale, inaccessible, or contradictory, continue with lower confidence and explicit open questions unless the conflict changes a critical durable-context claim.
