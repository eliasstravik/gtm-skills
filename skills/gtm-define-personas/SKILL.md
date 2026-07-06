---
name: gtm-define-personas
description: Define or refine lead-level persona files in the active GTM org or suborg. Use when the user mentions buyer roles, stakeholder roles, target contacts, titles, buying committees, lead fit criteria, objections, outreach hooks, no-match lead guidance, or missing persona context for lead segmentation, scoring, or research.
---

# GTM Define Personas

Own the per-org `personas/` collection. Each persona is one markdown file named
by its lowercase kebab-case id, written at the active org unless the user names
another canonical org path.

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
   - Read the `org.md` chain, visible ICP files, and visible persona files
     inherited down to the target org.

2. Pick create or refine.
   - Create when the requested persona id has no file at the target org.
   - Refine when the user asks to update, tighten, merge, split, rename, remove,
     or clarify an existing persona.
   - ICP references are loose: use qualified ICP labels when known, but dangling
     or future ICP references are allowed and should be marked clearly.
   - If the user's description belongs higher or lower than the active org,
     offer the better org path. If that org does not exist, hand off to
     `gtm-setup` add-suborg mode.

3. Draft the persona file.
   - Include display name, qualified label, relevant titles, responsibilities,
     buying influence, pains/priorities, objections, disqualifiers, outreach-safe
     hooks, ICP relevance, source notes, confidence, review needs, and open
     questions.
   - Keep lead-level content only. Do not copy full ICP definitions, write
     scores, create outreach drafts, or store one-off research.
   - Put general bad-fit guidance in persona disqualifiers and org constraints;
     do not create a fake persona just to represent `no-match`.

4. Preview and write.
   - Show target org path, file path, created/updated/preserved/deleted
     sections, unresolved questions, and proposed commit message.
   - State that no outreach, CRM update, export, sync, remote push, or other
     external side effect will happen.
   - Wait for explicit confirmation before editing.
   - Write only the target `personas/<id>.md`; create `personas/` only when
     writing the first persona file.
   - Preserve human-authored sections unless replacement or deletion was
     explicitly confirmed. Stage and commit only this skill's confirmed file
     when committing is appropriate. Never push.

5. End with an execution summary.
   - Report project, org path, target label, files read, file changed, commit
     hash or skip reason, and created/updated/preserved/removed personas.
   - List open questions, dangling ICP references, and any altitude mismatch
     that was resolved or left for `gtm-setup`.
   - Recommend downstream lead segmentation, scoring, or research only when the
     requested persona work is complete.

## Blocking Rules

- If no context resolves, stop with: `I could not resolve a GTM context repo
  from this prompt, current directory, or local state. Run gtm-setup or tell me
  which GTM project to use.`
- Unsafe ids, path escapes, missing target orgs, or unconfirmed destructive
  changes block writes.
- If context is too thin to draft at least one useful persona, ask one focused
  question with a recommended answer when possible.
- Do not write unresolved conflicts as facts; record them as open questions or
  mark the persona as needing review.
