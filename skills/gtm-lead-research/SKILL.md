---
name: gtm-lead-research
description: Research target leads and contacts against the active GTM workspace persona context. Use when the user asks for contact research, person-level briefs, outbound lead prep, buying-committee notes, personalization angles, or bulk lead research from CSVs, tables, contact lists, or research exports.
---

# GTM Lead Research

Produce person-level briefs grounded in workspace persona context. Normal
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
   - Read `organization.md`, active person file, workspace `context.md`,
     `personas.md`, optional `lead-scoring.md`, optional `icps.md`, and named
     business-unit/team files when present.
   - Completion criterion: project path, workspace id, persona source path,
     lead input source, and available saved source sections are known.

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
   - Before fetching or echoing saved or prompt-provided source links, classify
     them with `gtm-setup`'s source-link classifier when available. Never fetch
     or print secret-bearing, tokenized, invite, local-only, or private-tunnel
     URLs; require explicit per-run confirmation for private links and use
     redacted safe labels in outputs.
   - Treat saved active Person profile/source links and target lead/profile links from the prompt or input file as starting evidence: look there first, but do not treat them as permanent truth.
   - Distinguish confirmed workspace context, saved source links, safe source labels, newly found evidence, user-provided lead data, and unresolved open questions.
   - Do not present prompt-provided role, profile, CRM, or account claims as independently verified live facts. If you did not fetch or inspect the source in the current run, label the claim as `user-provided-context`.
   - Do not imply private data, intent, pain, budget, authority, or willingness to buy unless it is explicitly evidenced. Treat those as hypotheses or open questions.
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
   - Include project, workspace, persona source path, source context files
     read, hard prerequisites, composed skills, and skipped skills.
   - For one-off mode, return lead name, account, title, persona, optional
     score, research priority, brief, role relevance, likely priorities,
     account context, risks, personalization angles, recommended next step,
     confidence, review flag, reasoning, evidence, and open questions.
   - For bulk mode, start with priority distribution, persona distribution,
     fit distribution when scoring is present, low-confidence count,
     review-needed count, top signals, risks, and open questions; then return
     compact per-record fields.
   - State that no side effects occurred, including no CRM updates,
     file/context writes, outreach, exports, syncs, campaign actions, durable
     context promotions, or external calls unless explicitly performed as
     source research and cited. Preview and confirm before export, save, sync,
     CRM update, outreach, campaign action, or durable context promotion.

## Blocking Rules

- If no GTM Context Project resolves, stop with exactly:

  > I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

- If the active workspace has no usable `personas.md`, stop with:

  > I found a GTM Context Project and active workspace, but this workspace has no usable `workspaces/<workspace-id>/personas.md`. Run `gtm-define-personas` first, then rerun `gtm-lead-research`.

- If the input is a malformed CSV/table file, explain the parsing problem and ask for a corrected file or pasted table.
- If saved source links are stale, inaccessible, or contradictory, continue with lower confidence and explicit open questions unless the conflict changes a critical durable-context claim.
