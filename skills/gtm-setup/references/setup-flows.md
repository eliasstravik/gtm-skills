# Setup flows

Interaction rules for every flow: exactly one question per message. A question
offering discrete options is a numbered list ending exactly
`Reply with a number, or type your answer.` with at most one `(Recommended)`;
open questions are plain text. Every durable write is previewed as complete
exact content with approval asked in the same message. Echo position before
acting. Never guess company facts from model memory — scaffolded content
carries supplied facts only. End every flow with a closing summary of what was
created or changed (paths + commits) or that the repo is healthy.

## Create (keyboard surfaces only)

1. Interview: company facts (open) → operator name/email/role (open) → any
   other context (open) → remote wiring (numbered choice).
2. Preview and write the boilerplate byte-for-byte from `templates/`
   (`AGENTS.md`, `CLAUDE.md`, `gitignore` → `.gitignore`); `git init`; commit
   `Initialize GTM context repo`.
3. Preview and write `org.md` (template skeleton, supplied facts, H1 = display
   name); commit.
4. Preview and write `people/<id>/person.md` (Email line mandatory); commit.
5. Wire the remote if supplied, then push; otherwise note the solo case.
6. Confirm the operator now resolves from git identity; closing summary.

## Import (keyboard surfaces only)

1. Inventory the directory against the contract; report findings (defects and
   healthy parts) before changing anything.
2. Run the doctor flow below on the findings; `git init` first when the
   directory is not yet a repo (commit `Initialize GTM context repo` for
   net-new scaffolding, `Repair GTM context repo` for repairs).
3. Offer remote wiring; closing summary.

## Add suborg

1. Derive the parent org from position or the request; id lowercase
   kebab-case; ask only for facts the user hasn't given.
2. Preview `suborgs/.../org.md` (template skeleton, supplied facts only);
   write after approval; commit; refer to the org by its canonical path.

## Add person

1. Root-only `people/<id>/person.md` from the template; Email line mandatory.
2. Preview, write after approval, commit.

## Doctor / repair

1. Check the full doctor checklist in `references/context-contract.md`.
2. Report every defect found; propose exact repairs; preview them (complete
   content for rewrites, exact operations for moves/renames/deletions).
3. Apply approved repairs; batch them into one non-amending
   `Repair GTM context repo` commit; report healthy and change nothing when
   nothing is wrong.

## Recovery (another GTM skill failed)

1. Identify which derivation failed: position (cwd outside a repo?), operator
   (git identity matches no person?), or repo shape (contract defect?).
2. Run doctor; report what was fixed and what the calling skill should now
   resolve.

## Surface refusal

Create and import need a keyboard. Requested while acting as an app surface,
refuse and redirect: repo creation needs a keyboard — run gtm-setup from your
CLI. Perform nothing for that request. Every other flow proceeds on any
surface.
