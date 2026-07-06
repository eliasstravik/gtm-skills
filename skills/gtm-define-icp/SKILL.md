---
name: gtm-define-icp
description: Define or refine account-level ICP files in the active GTM org or suborg. Use when the user mentions ideal customers, target accounts, account fit criteria, disqualifiers, markets, no-match account guidance, or missing ICP context for account segmentation, scoring, or research.
---

# GTM Define ICP

Own the per-org `icps/` collection. Each ICP is one markdown file named by its
lowercase kebab-case id, written at the active org unless the user names another
canonical org path.

## Core Workflow

1. Resolve and echo context.
   - Default `$GTM_HOME` to `~/.gtm`; read local state from
     `$GTM_HOME/state.json`.
   - Resolve project by prompt, current directory inside a context repo, then
     active state. Resolve org by prompt, state pin, then root.
   - Person is optional for this skill; omit it from the echo unless explicitly
     named or already pinned.
   - Echo: `Working in <project>/<org-path>` and add `as <person>` only when
     one resolves.
   - Read the `org.md` chain from root to the target org and visible ICP files
     inherited down the chain.

2. Pick create or refine.
   - Create when the requested ICP id has no file at the target org.
   - Refine when the user asks to update, tighten, merge, split, rename, remove,
     or clarify an existing ICP.
   - If the user's description belongs higher or lower than the active org,
     offer the better org path. If that org does not exist, hand off to
     `gtm-setup` add-suborg mode instead of creating it here.

3. Draft the ICP file.
   - Include display name, qualified label, account profile, firmographic and
     operating signals, buying triggers, disqualifiers, source notes,
     confidence, review needs, and open questions.
   - Use canonical labels: root ICP `enterprise` is `enterprise`; child ICP
     `cloud/emea/enterprise` is qualified by org path.
   - Keep account-level content only. Do not write personas, scores, outreach,
     one-off research, or raw imports.
   - Put general bad-fit guidance in disqualifiers and org constraints; do not
     create a fake ICP just to represent `no-match`.

4. Preview and write.
   - Show target org path, file path, created/updated/preserved/deleted
     sections, unresolved questions, and proposed commit message.
   - State that no CRM update, outreach, export, sync, remote push, or other
     external side effect will happen.
   - Wait for explicit confirmation before editing.
   - Write only the target `icps/<id>.md`; create `icps/` only when writing the
     first ICP file.
   - Preserve human-authored sections unless replacement or deletion was
     explicitly confirmed. Stage and commit only this skill's confirmed file
     when committing is appropriate. Never push.

5. End with an execution summary.
   - Report project, org path, target label, files read, file changed, commit
     hash or skip reason, and created/updated/preserved/removed ICPs.
   - List open questions and any altitude mismatch that was resolved or left
     for `gtm-setup`.
   - Recommend `gtm-define-personas` when persona context is missing or stale.

## Blocking Rules

- If no context resolves, stop with: `I could not resolve a GTM context repo
  from this prompt, current directory, or local state. Run gtm-setup or tell me
  which GTM project to use.`
- Unsafe ids, path escapes, missing target orgs, or unconfirmed destructive
  changes block writes.
- If context is too thin to draft at least one useful ICP, ask one focused
  question with a recommended answer when possible.
- Do not write unresolved conflicts as facts; record them as open questions or
  mark the ICP as needing review.
