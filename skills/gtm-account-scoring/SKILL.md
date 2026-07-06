---
name: gtm-account-scoring
description: Score account fit and timing after account segmentation. Use when the user asks to rank, prioritize, score, qualify, grade, or choose next actions for accounts against ICPs, including one-off accounts, CSVs, routing lists, research outputs, or outbound prioritization.
---

# GTM Account Scoring

Score accounts against workspace ICPs and account scoring criteria.
Normal scoring output is ephemeral. This skill owns
`workspaces/<workspace-id>/account-scoring.md` only when criteria must be
created or changed.

## Core Workflow

1. Resolve the GTM Context Project.
   - Default `$GTM_HOME` to `~/.gtm`.
   - Resolve project by prompt, current-directory `gtm.yaml`, then
     `$GTM_HOME/registry.json`.
   - Resolve workspace by prompt, registry active state, then `gtm.yaml`.
   - Validate resolved ids and paths before any read, write, stage, or commit:
     project, workspace, business-unit, and team ids must be lowercase slug ids;
     reject derived child paths that are absolute, contain `..`, or resolve
     outside the canonical project root, including symlink escapes.
   - Read `organization.md`, workspace `context.md`, `icps.md`, and
     `account-scoring.md` when present.
   - Completion criterion: project path, workspace id, ICP source path,
     account input source, and scoring-criteria state are known.

2. Enforce hard prerequisites.
   - If no GTM Context Project resolves, stop with the exact missing-context failure in Blocking Rules.
   - If a project resolves but no active or default workspace can be determined, ask the user to choose a workspace or run `gtm-setup` repair.
   - If `workspaces/<workspace-id>/icps.md` is missing, empty, or placeholder-only, stop and route the user to `gtm-define-icp`.
   - If account scoring criteria are missing, empty, or placeholder-only, draft
     a concise proposal from `icps.md` and workspace context; preview the
     durable write to `account-scoring.md`; wait for confirmation before
     creating or updating it.
   - Completion criterion: account scoring is grounded in usable context, ICP definitions, and confirmed or existing scoring criteria.

3. Establish account segmentation.
   - Use a provided `segment_label` only when it is clearly the output of `gtm-account-segmentation` or exactly matches a workspace ICP machine label.
   - When a supplied segment label exactly matches a machine label defined in
     `icps.md`, accept it as the starting segment and score from it; do not
     re-label the account unless the account evidence clearly contradicts the
     supplied label or hits a `no-match` disqualifier.
   - If no segment is provided, compose `gtm-account-segmentation` first for the same one-off account or bulk input, then score from its `segment_label`, confidence, reasoning, provenance, and open questions.
   - Never invent new ICP labels in scoring output. If the user wants a new account segment, route to `gtm-define-icp`.
   - Completion criterion: every account has one segment label, including `no-match` when no defined ICP matches.

4. Score fit and timing.
   - Use `account-scoring.md`, segment, evidence, open questions, and
     disqualifiers.
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
   - Include project, workspace, ICP source, scoring source, hard
     prerequisites, whether segmentation was supplied or composed, and the
     source context files read (`organization.md`, workspace `context.md`,
     `icps.md`, and `account-scoring.md` when present).
   - For one-off mode, return account name, segment label, score, fit label,
     evidence summary, positives, risks/disqualifiers, recommended action,
     confidence, review flag, reasoning, evidence, and open questions.
   - For bulk mode, start with fit distribution, low-confidence count,
     review-needed count, common risks, and common open questions; then return
     compact per-record fields.
   - State that no side effects occurred for normal scoring output, including
     no CRM updates, file/context writes, outreach, exports, syncs, scoring
     criteria changes, or external calls. Preview and confirm before exporting,
     syncing, updating CRM, changing criteria, or writing context.

## Blocking Rules

- If no GTM Context Project resolves, stop with exactly:

  > I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

- If the active workspace has no usable `icps.md`, stop with:

  > I found a GTM Context Project and active workspace, but this workspace has no usable `workspaces/<workspace-id>/icps.md`. Run `gtm-define-icp` first, then rerun `gtm-account-scoring`.

- If account scoring criteria are missing, preview `account-scoring.md` and wait
  for confirmation before creating or updating it.
- If the input is a malformed CSV/table file, explain the parsing problem and ask for a corrected file or pasted table.
- If `gtm-account-segmentation` returns `no-match`, do not negotiate the cap: return `not-a-fit` with `score <= 49`.
