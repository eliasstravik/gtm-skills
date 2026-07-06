---
name: gtm-lead-scoring
description: Score lead relevance and outreach timing after lead segmentation. Use when the user asks to rank, prioritize, score, qualify, grade, or choose next actions for leads against personas, including one-off leads, CSVs, routing lists, research outputs, or outbound prioritization.
---

# GTM Lead Scoring

Score leads against workspace personas and lead scoring criteria. Normal
scoring output is ephemeral. This skill owns
`workspaces/<workspace-id>/lead-scoring.md` only when criteria must be
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
   - Read `organization.md`, workspace `context.md`, `personas.md`, and
     `lead-scoring.md` when present.
   - Completion criterion: project path, workspace id, persona source path,
     lead input source, and scoring-criteria state are known.

2. Enforce hard prerequisites.
   - If no GTM Context Project resolves, stop with the exact missing-context failure in Blocking Rules.
   - If a project resolves but no active or default workspace can be determined, ask the user to choose a workspace or run `gtm-setup` repair.
   - If `workspaces/<workspace-id>/personas.md` is missing, empty, or placeholder-only, stop and route the user to `gtm-define-personas`.
   - If lead scoring criteria are missing, empty, or placeholder-only, draft a
     concise proposal from `personas.md` and workspace context; preview the
     durable write to `lead-scoring.md`; wait for confirmation before creating
     or updating it.
   - Completion criterion: lead scoring is grounded in usable context, persona definitions, and confirmed or existing scoring criteria.

3. Establish lead segmentation.
   - Use a provided `persona_label` only when it is clearly the output of `gtm-lead-segmentation` or exactly matches a workspace persona machine label.
   - When a supplied persona label exactly matches a machine label defined in
     `personas.md`, accept it as the starting persona and score from it; do not
     re-label the lead unless the lead evidence clearly contradicts the supplied
     label or hits a `no-match` disqualifier.
   - If no persona label is provided, compose `gtm-lead-segmentation` first for the same one-off lead or bulk input, then score from its `persona_label`, confidence, reasoning, provenance, and open questions.
   - Never invent new persona labels in scoring output. If the user wants a new persona, route to `gtm-define-personas`.
   - Completion criterion: every lead has one persona label, including `no-match` when no defined persona matches.

4. Score fit and timing.
   - Use `lead-scoring.md`, persona, evidence, open questions, and
     disqualifiers.
   - Use a 1-100 `score` with fit labels:
     - `1-49`: `not-a-fit`
     - `50-74`: `good-fit`
     - `75-89`: `great-fit`
     - `90-100`: `excellent-fit`
   - If `persona_label: no-match`, return `fit_label: not-a-fit` and cap `score` at 49 no matter how interesting the lead looks.
   - Set `confidence` to `low`, `medium`, or `high` based on evidence quality, freshness, directness, gaps, and conflicts.
   - Set `needs_review: true` for every new low-confidence result and for medium/high-confidence results with material ambiguity, conflicts, sensitive/private-source dependency, a possible disqualifier, or a high score supported by weak evidence.
   - Completion criterion: every lead has score, fit label, evidence summary, positives, risks/disqualifiers, recommended action, provenance, confidence, reasoning, review flag, and open questions.

5. Return the result.
   - Include project, workspace, persona source, scoring source, hard
     prerequisites, whether segmentation was supplied or composed, and the
     source context files read (`organization.md`, workspace `context.md`,
     `personas.md`, and `lead-scoring.md` when present).
   - For one-off mode, return lead name, account name when known, persona
     label, score, fit label, evidence summary, positives, risks,
     recommended action, confidence, review flag, reasoning, evidence, and
     open questions.
   - Use explicit field labels for reviewability: `score`, `fit_label`,
     `evidence summary`, `positives`, `risks/disqualifiers`,
     `recommended action`, `confidence`, `needs_review`, `reasoning`,
     `evidence`, and `open questions`.
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

- If the active workspace has no usable `personas.md`, stop with:

  > I found a GTM Context Project and active workspace, but this workspace has no usable `workspaces/<workspace-id>/personas.md`. Run `gtm-define-personas` first, then rerun `gtm-lead-scoring`.

- If lead scoring criteria are missing, preview `lead-scoring.md` and wait for
  confirmation before creating or updating it.
- If the input is a malformed CSV/table file, explain the parsing problem and ask for a corrected file or pasted table.
- If `gtm-lead-segmentation` returns `no-match`, do not negotiate the cap: return `not-a-fit` with `score <= 49`.
