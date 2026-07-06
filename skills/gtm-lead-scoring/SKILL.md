---
name: gtm-lead-scoring
description: Score lead relevance and outreach timing after lead segmentation. Use when the user asks to rank, prioritize, score, qualify, grade, or choose next actions for leads against personas, including one-off leads, CSVs, routing lists, research outputs, or outbound prioritization.
---

# GTM Lead Scoring

Score leads against persona labels and lead scoring criteria. Normal scoring
output is ephemeral. This skill owns `lead-scoring.md` at an org only when
criteria must be created or changed.

## Core Workflow

1. Resolve and echo context.
   - Default `$GTM_HOME` to `~/.gtm`; read local state from
     `$GTM_HOME/state.json`.
   - Resolve project by prompt, current directory inside a context repo, then
     active state. Resolve org by prompt, state pin, then root.
   - Person is not needed; omit it unless explicitly named.
   - Echo: `Working in <project>/<org-path>`.
   - Read the `org.md` chain, visible persona files, and lead scoring files
     along relevant org chains.

2. Establish segmentation.
   - Accept a provided `persona_label` only when it is `no-match` or exactly
     matches a visible qualified persona label.
   - If no persona label is supplied, compose `gtm-lead-segmentation` for the
     same input and score from its label, confidence, evidence, and open
     questions.
   - Never invent persona labels. Route new persona needs to
     `gtm-define-personas`.

3. Resolve scoring criteria.
   - For each lead with a persona label, start at that persona's org and walk
     up to root; the nearest `lead-scoring.md` governs that record.
   - For `no-match`, use active-org scoring criteria when present, but cap the
     score below fit threshold.
   - If no governing criteria exist, draft a concise `lead-scoring.md` proposal
     for the active org, preview it, and wait for confirmation before writing.
   - Write only `lead-scoring.md` at the confirmed org. Do not edit personas,
     ICPs, account criteria, or research files.

4. Score relevance and timing.
   - Use a 1-100 score with fit labels:
     - `1-49`: `not-a-fit`
     - `50-74`: `good-fit`
     - `75-89`: `great-fit`
     - `90-100`: `excellent-fit`
   - If `persona_label` is `no-match`, return `not-a-fit` and cap score at 49.
   - Include evidence summary, positives, risks/disqualifiers, recommended
     action, confidence, `needs_review`, reasoning, provenance, and open
     questions.
   - Set `needs_review` for low confidence, material ambiguity, private-source
     dependency, possible disqualifiers, unclear buying influence, or high
     scores backed by weak evidence.

5. Return the result.
   - Include project, active org path, persona source, scoring source per
     record, prerequisites, and whether segmentation was supplied or composed.
   - For one-off mode, return lead name, account name when known,
     `persona_label`, score, fit label, evidence summary, positives, risks,
     recommended action, confidence, review flag, reasoning, evidence, and open
     questions.
   - For bulk mode, start with fit distribution, low-confidence count,
     review-needed count, common risks, and common open questions; then return
     compact per-record fields.
   - State that no side effect occurred unless scoring criteria were explicitly
     previewed, confirmed, and written.

## Blocking Rules

- If no context resolves, stop with: `I could not resolve a GTM context repo
  from this prompt, current directory, or local state. Run gtm-setup or tell me
  which GTM project to use.`
- If no visible persona files exist, stop and route to `gtm-define-personas`.
- If criteria are missing, preview `lead-scoring.md` and wait for confirmation
  before creating or updating it.
- Malformed CSV/table input blocks bulk scoring until corrected.
- `no-match` always scores `not-a-fit` with `score <= 49`.
