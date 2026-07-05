# Multiplayer Mode

Load this reference when the user asks to share, collaborate on, publish, join, go multiplayer, save and share, or sync a GTM Context Project.

Multiplayer is a mode of `gtm-setup`, not a separate skill. Default setup stays local-only: `git init`, local commit, no remote, and no push. A project becomes shared only when the user explicitly asks.

## Push Invariant

Never push by default. The only sanctioned pushes are:

1. the initial publish push after explicit user confirmation, and
2. the session-batched sync branch push after explicit user confirmation.

No other skill should push GTM context by default.

## Join Flow

Joining a shared project is the normal import path:

1. Clone the GitHub repo under `$GTM_HOME/<slug>`.
2. Run the instruction trust gate for `AGENTS.md` and `CLAUDE.md`.
3. Run the `gtm.yaml` structure gate.
4. Register the project and set local active state only after the gates pass.

Do not create a separate join mechanism.

## Publish Flow

Use publish when the user explicitly asks to share or collaborate on an existing local project.

1. Confirm intent.
   - Explain that this creates a private GitHub repo by default and pushes the current local context once.
   - State that the repo may contain company, positioning, proof, workspace, and person facts.
2. Check git and GitHub auth.
   - Assume `git` and `gh` are the supported CLIs.
   - If `gh` is missing or auth fails, point the user at `gh auth login` or their SSH setup.
   - Never collect credentials, tokens, or private keys.
3. Create the GitHub repo private by default.
   - Use an owner/name the user confirms or a clear default derived from the Organization ID.
   - Preserve the local repo history.
4. Add the remote and push current `main` only after confirmation.
5. Report the repo URL and tell teammates to join through import.

## Session-Batched Sync

Use sync when a shared project already has a remote and the user explicitly asks to save and share ongoing context edits.

1. Review the local diff and show a concise side-effect preview.
2. Pull/rebase latest `main`; if conflicts appear, surface them and resolve with the user. Never force-push over teammates.
3. Create a branch for the session batch.
4. Commit only the context edits from this session.
5. Push the branch after confirmation.
6. Create a PR with `gh pr create`.
7. Surface the PR to the editing user for self-approval and self-merge.

The PR is the audit trail and conflict-safety mechanism. It is not a peer gatekeeping requirement.

## Safety Rules

- Keep entity/work data out of the repo. Job workspaces under `.tmp/<skill>/` are ignored and never synced.
- Never commit secrets, signed URLs, invite links, tokens, `.env` files, or raw research scratch.
- If pull/rebase, branch push, PR creation, or merge fails, report the blocker and leave local files intact.
- If the user wants to make a public repo, require explicit confirmation because context may include person and company facts.
