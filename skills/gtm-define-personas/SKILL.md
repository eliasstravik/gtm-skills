---
name: gtm-define-personas
description: Define or refine lead-level persona files in the active GTM org or suborg. Use when the user mentions buyer roles, stakeholder roles, target contacts, titles, buying committees, lead fit criteria, objections, outreach hooks, no-match lead guidance, or missing persona context for lead segmentation, scoring, or research.
---

# GTM Define Personas

## Recipe

1. Resolve and echo `Working in <project>/<org-path>` plus `as <person>` only when explicitly named or pinned.
2. Read the org chain, visible ICP files, and visible inherited or local persona files.
3. Reject unresolved context, unsafe ids, path escapes, missing target orgs, unconfirmed destructive changes, and unsupported ownership.
4. Choose create or refine for one per-org `personas/<id>.md` file at the target org.
5. Draft lead-level persona content with the required label, evidence, confidence, review needs, ICP relevance, and open questions.
6. Preview target path, section changes, unresolved questions, no-external-side-effect statement, and commit message; write only after explicit confirmation.
7. Return project, org path, target label, files read, changed file, commit hash or skip reason, section status, altitude mismatch, dangling ICP references, open questions, and downstream recommendation.

## Details

- Default `$GTM_HOME` to `~/.gtm`; read state only from `$GTM_HOME/state.json`.
- Resolve project by prompt, current context repo, then active state; resolve org by prompt, state pin, then root.
- If no context resolves, stop with: `I could not resolve a GTM context repo from this prompt, current directory, or local state. Run gtm-setup or tell me which GTM project to use.`
- Validate all ids and paths before reading; reject absolute paths, `..`, separators in ids, non-kebab ids, and symlink escapes.
- This skill owns only per-org `personas/<id>.md` files and creates `personas/` only when writing the first persona.
- Create when the requested persona id has no file at the target org; refine for update, tighten, merge, split, rename, remove, or clarify requests.
- ICP references are loose: use qualified ICP labels when known, but mark dangling or future ICP references clearly.
- If the description belongs higher or lower than the active org, offer the better org path; if that org does not exist, hand off to `gtm-setup` add-suborg mode.
- Persona labels are org-qualified; `no-match` is bad-fit guidance in disqualifiers or org constraints, never a fake persona file.
- Drafts include display name, qualified label, titles, responsibilities, influence, pains/priorities, objections, disqualifiers, outreach-safe hooks, ICP relevance, source notes, confidence, review needs, and open questions.
- Keep lead-level content only; do not copy full ICP definitions, write scores, create outreach drafts, store one-off research, update CRM, export, sync, remote push, or edit unrelated files.
- If context is too thin to draft at least one useful persona, ask one focused question with a recommended answer when possible.
- Preserve human-authored sections unless replacement or deletion was explicitly confirmed.
- Stage and commit only this skill's confirmed file when committing is appropriate; never push.
- Do not write unresolved conflicts as facts; record them as open questions or mark the persona as needing review.
- Recommend downstream lead segmentation, scoring, or research only when the requested persona work is complete.
