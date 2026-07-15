---
name: gtm-define-icp
description: Define or refine account-level ICP files in the active GTM org or suborg. Use when the user mentions ideal customers, target accounts, account fit criteria, disqualifiers, markets, no-match account guidance, or missing ICP context for account segmentation, scoring, or research.
---

# GTM Define ICP

## Recipe

1. Resolve and echo `Working in <project>/<org-path>` plus `as <person>` only when explicitly named or pinned.
2. Read the root-to-target `org.md` chain and every visible inherited or local ICP file.
3. Reject unresolved context, unsafe ids, path escapes, missing target orgs, unconfirmed destructive changes, and unsupported ownership.
4. Choose create or refine for one per-org `icps/<id>.md` file at the target org.
5. Draft account-level ICP content with the required label, evidence, confidence, review needs, and open questions.
6. Preview target path, section changes, unresolved questions, no-external-side-effect statement, and commit message; write only after explicit confirmation.
7. Return project, org path, target label, files read, changed file, commit hash or skip reason, section status, altitude mismatch, open questions, and downstream recommendation.

## Details

- Default `$GTM_HOME` to `~/.gtm`; read state only from `$GTM_HOME/state.json`.
- Resolve project by prompt, current context repo, then active state; resolve org by prompt, state pin, then root.
- If no context resolves, stop with: `I could not resolve a GTM context repo from this prompt, current directory, or local state. Run gtm-setup or tell me which GTM project to use.`
- Validate all ids and paths before reading; reject absolute paths, `..`, separators in ids, non-kebab ids, and symlink escapes.
- This skill owns only per-org `icps/<id>.md` files and creates `icps/` only when writing the first ICP.
- Create when the requested ICP id has no file at the target org; refine for update, tighten, merge, split, rename, remove, or clarify requests.
- If the description belongs higher or lower than the active org, offer the better org path; if that org does not exist, hand off to `gtm-setup` add-suborg mode.
- Qualified labels are the root stem at root and `<org-path>/<stem>` for child orgs.
- `no-match` is guidance in disqualifiers or org constraints, never a fake ICP file.
- Drafts include display name, qualified label, account profile, firmographic and operating signals, buying triggers, disqualifiers, source notes, confidence, review needs, and open questions.
- Keep account-level content only; do not write personas, scores, outreach, one-off research, raw imports, CRM updates, exports, syncs, remote pushes, or unrelated files.
- If context is too thin to draft at least one useful ICP, ask one focused question with a recommended answer when possible.
- Preserve human-authored sections unless replacement or deletion was explicitly confirmed.
- Stage and commit only this skill's confirmed file when committing is appropriate; never push.
- Do not write unresolved conflicts as facts; record them as open questions or mark the ICP as needing review.
- Recommend `gtm-define-personas` when persona context is missing or stale.
