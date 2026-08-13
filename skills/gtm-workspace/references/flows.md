# Guided flows

Use the matched flow from `SKILL.md`. Keep ownership through completion; these users should never need git or command-line knowledge.

## Contents

- [Interaction protocol](#interaction-protocol)
- [Guided menu](#guided-menu)
- [Surface refusal](#surface-refusal)
- [Create](#create-keyboard-surfaces-only)
- [Import](#import-keyboard-surfaces-only)
- [Update](#update)
- [Delete](#delete)
- [Doctor](#doctor)
- [Git problem patterns](#git-problem-patterns)

## Interaction protocol

- Ask exactly one question per message. Begin the message with that clear bold question; put status, context, guidance, examples, and options below it.
- Format every discrete choice as a numbered list, mark at most one option `(Recommended)`, and end exactly `Reply with a number, or type your answer.`
- Show what is possible before asking the user to choose. Use everyday terms; say “saved to history,” not commit, SHA, rebase, branch, or upstream unless explaining a problem makes a term unavoidable.
- Resolve the connected context repo first: a repo explicitly named in the request, else the repo the hosting environment declares as connected, else canonical repos under `~/.gtm/` whose root contains `ORG.md`. If several valid repos exist and none was named, list their display names and paths as numbered options. Treat roots with only legacy `org.md` as migration candidates, not canonical repos. Do not save a preferred repo. If update, delete, or doctor has no repo to use, explain that; on a keyboard surface offer create/import through the guided menu, and on a fixed-connection surface use the surface refusal.
- Discover organization nodes recursively from the root through repeated `suborgs/<suborg-slug>/` segments. Display each node with its full repository-relative path, and resolve every member relative to its owning node; never collapse same-named nodes or members from different branches.
- Never repeat or open an unsafe link. Follow `contract.md` link safety and continue using a plain-language source label.
- Research may combine model knowledge, fetched public sources, and supplied files/folders. Separate known facts from uncertain inferences in the draft; do not invent a member's email.
- Before any durable change, show the complete proposed file content and/or exact file operations in chat. Ask:

  1. Accept and save (Recommended)
  2. Change it
  3. Cancel

  `Reply with a number, or type your answer.`

- If the user chooses change, ask `What would you like me to change?`, revise, and show the complete proposal with the same choice. Repeat until accepted or cancelled. Cancellation writes nothing from that proposal.
- After acceptance, write exactly the accepted proposal and run the background git ritual in `contract.md`. Close every completed flow with paths and a tree-like breakdown or clean bill of health.
- Surface every git problem as a plain-English explanation followed by numbered options, with exactly one `(Recommended)` and the required reply line. Never force, branch, use a worktree, change global git config, or discard work.

## Guided menu

When no verb is clear, begin with:

> **What would you like to do with an organization's GTM workspace?**

Then explain:

> A GTM workspace is a saved folder for one organization. It gives your agent the background it needs for GTM work.

1. Create a GTM workspace for a new organization (Recommended when starting fresh)
2. Import an organization's existing folder or GitHub repository
3. Update organization or member information
4. Delete selected information or a whole organization's context
5. Check and repair a context that may be broken

`Reply with a number, or type your answer.`

## Surface refusal

Create, import, sharing setup, and whole-repo deletion change which repo is connected, not just its contents, so they need a human at a keyboard. When one is requested while the repo connection is fixed by the deployment, refuse in one short message and perform nothing for that request:

- Why: this deployment's repo connection is part of its configuration, so a conversation here cannot create, replace, or remove it.
- What to do: run gtm-workspace from Claude Code or Codex CLI at a keyboard to create or import a context, set up sharing, or delete a whole context.
- What happens after: once a repo is connected to this deployment, updating, deleting content, and doctoring all work right here.

Write nothing, draft nothing, and research nothing for the refused request; do not produce carry-over artifacts in chat. Every other flow proceeds on any surface with a connected repo.

## Create (keyboard surfaces only)

1. Check that git is installed before touching the target. If missing, explain it is the history tool this context needs and offer one guided install path appropriate to the operating system `(Recommended)` plus cancel; execute only the chosen path, then recheck.
2. Treat every value inside an `Example (fictional)` below as presentation only. Never extract, research, preview, or save it unless the user independently supplies the same value. Create `~/.gtm/` when absent, then start root intake with exactly this one identity-and-primary-links question:

   > **What is the organization's name, website, and any social profiles such as LinkedIn?**
   >
   > Share whatever you have in one message. The website and social profiles are optional.
   >
   > Example (fictional): `Brightpath Analytics — https://brightpath.example — LinkedIn: https://linkedin.example/company/brightpath-analytics`

   Extract the display name first. If it is missing, ask exactly `**What is the organization's name?**` and request nothing else. Derive the lowercase kebab-case slug from the accepted name and check `~/.gtm/<org-slug>`. Apply link safety before opening any user-supplied URL.
3. If the path exists, offer: open the existing context `(Recommended)`, choose another slug, or cancel. Never merge or overwrite implicitly.
4. Continue root intake with exactly this sources question:

   > **Are there any other links, files, or folders you'd like me to research for this context?**
   >
   > Example (fictional): `https://docs.brightpath.example`, `/path/to/Brightpath sales deck.pdf`, or `/path/to/customer-interviews/`. You can paste several items or say `none`.

   Accept URLs and readable local paths together. Classify each supplied item, apply link safety to every URL before opening it, and research readable supplied paths. A missing optional primary link or `none` requires no follow-up.
5. Research only user-supplied sources and safe public facts, then draft `ORG.md` using the contract's small, flat shape. Mark uncertain claims plainly. Begin the proposal turn exactly `Here is the complete proposed \`~/.gtm/<org-slug>/ORG.md\`:` and run the accept loop on the complete draft. No other assistant turn may occur between the sources answer and this proposal.
6. On first acceptance, create the repo; copy `templates/AGENTS.md`, `templates/CLAUDE.md`, and `templates/gitignore` to `AGENTS.md`, `CLAUDE.md`, and `.gitignore`; write accepted `ORG.md`; initialize git on `main`; set only repo-local identity to `GTM Workspace <gtm@local>`; and save the accepted scaffold to history. The `ORG.md` acceptance authorizes these boilerplate files.
7. Decide the suborganization recommendation from GTM diversity, not headcount alone. Recommend no suborganizations when the same ICP and offering can share context; recommend yes only when distinct businesses would make shared GTM workspace misleading. Ask: no suborganizations / add one / add in bulk, marking the contextual recommendation. Finish the entire accepted suborganization stage before collecting the operator or any other member.
8. For one suborganization, begin with exactly:

   > **What is the suborganization's name, website, and any social profiles?**
   >
   > Share whatever you have in one message. The website and social profiles are optional.
   >
   > Example (fictional): `Brightpath Enterprise — https://enterprise.brightpath.example — LinkedIn: https://linkedin.example/company/brightpath-enterprise`

   If its display name is missing, ask exactly `**What is the suborganization's name?**` and request nothing else. Then ask exactly:

   > **Are there any other links, files, or folders you'd like me to research for this suborganization's context?**
   >
   > Example (fictional): `https://enterprise.brightpath.example/docs`, `/path/to/Brightpath Enterprise deck.pdf`, or `/path/to/enterprise-interviews/`. You can paste several items or say `none`.

   Once the name is accepted, `this suborganization` may be replaced by its exact display name in that bold question. Apply the same optional-field, local-path, research, and link-safety rules as root intake. Begin its draft turn exactly `Here is the complete proposed \`suborgs/<suborg-slug>/ORG.md\`:` for a direct child; recursively nested paths repeat `suborgs/<suborg-slug>/`. Preview and accept it, then write that one artifact and save it to history. Preserve contextual recommendations and nesting rules.
9. For bulk suborganizations, ask exactly:

   > **Which suborganizations would you like to add?**
   >
   > Paste their names, parent relationships, websites, social profiles, and any other links, files, or folders in one message. Include whatever you have; only each suborganization's name is required.
   >
   > Example (fictional): `Brightpath Enterprise — parent: Brightpath Analytics — https://enterprise.brightpath.example — LinkedIn: https://linkedin.example/company/brightpath-enterprise`

   Parse the one freeform dump into the existing proposed nested set. If any names are missing, ask one recovery turn beginning exactly `**What are the missing names for these suborganizations?**` and place only the necessary record-identifying context below it. Do not conduct per-field interviews. Begin the cleaned-set operations proposal exactly `Here is the proposed suborganization set:` and accept it. Show every recursive destination with repeated literal segments such as `suborgs/<suborg-slug>/suborgs/<suborg-slug>/ORG.md`. Then research and run the artifact accept loop for each `ORG.md`; offer a numbered choice between reviewing one at a time `(Recommended)` or one batch. Begin a batch artifact proposal exactly `Here is the complete proposed suborganization batch:`. Create no empty directories.
10. Collect the operator only after the suborganization set is final. With no saved suborganizations, ask exactly:

   > **What is your full name, email address, role, and any social profiles such as LinkedIn?**
   >
   > Share whatever you have in one message. Your role and social profiles are optional.
   >
   > Example (fictional): `Jordan Lee — jordan@brightpath.example — Head of Sales — LinkedIn: https://linkedin.example/in/jordan-lee`

   When saved suborganizations exist, instead ask exactly `**What is your full name, email address, role, any social profiles such as LinkedIn, and which suborganizations you work with?**` with the same guidance and fictional example, then list every valid suborganization by exact display name and full path immediately below it. The operator's member record is root-owned; affiliations are optional, so do not infer one or follow up when omitted. If required operator data is missing, use exactly one applicable recovery question and request nothing else: `**What is your full name?**`, `**What is your email address?**`, or `**What are your full name and email address?**`.
11. Continue operator intake with exactly:

   > **Are there any other links, files, or folders you'd like me to research for this member's context?**
   >
   > Example (fictional): `https://brightpath.example/team/jordan`, `/path/to/Jordan Lee resume.pdf`, or `/path/to/interview-notes/`. You can paste several items or say `none`.

   Do not follow up for an omitted role, social profile, affiliation, or source. Apply link safety and research readable user-supplied paths. Begin the draft turn exactly `Here is the complete proposed \`members/<member-slug>/MEMBER.md\`:`. Include only known optional fields. After acceptance, set repo-local git name/email to the accepted operator, write the member, and save it to history.
12. Ask about more members: done `(Recommended)`, add one, or add in bulk. For one additional member, use `**What is this member's full name, email address, role, and any social profiles such as LinkedIn?**` when there are no saved suborganizations. When saved suborganizations exist, use exactly `**What is this member's full name, email address, role, any social profiles such as LinkedIn, which organization should own their member record, and which other suborganizations they work with?**` and list root plus every recursively discovered suborganization by exact display name and full path immediately below it. Say the role, social profiles, owner beyond the recommended root, and additional affiliations are optional. If required data is missing, use exactly one applicable recovery question and request nothing else: `**What is this member's full name?**`, `**What is this member's email address?**`, or `**What are this member's full name and email address?**`. Then use the same exact other-sources question and example from step 11. Begin the draft turn with the complete node-relative destination, ending in `members/<member-slug>/MEMBER.md`. Never add a separate owner or affiliation turn, infer an affiliation, or omit repeated `suborgs/<suborg-slug>/` segments from a nested destination.
13. For bulk members, ask exactly:

   > **Which members would you like to add?**
   >
   > Paste each member's full name, email address, role, social profiles, and any other links, files, or folders in one message. Include whatever you have; only full names and email addresses are required.
   >
   > Example (fictional): `Jordan Lee — jordan@brightpath.example — Head of Sales — LinkedIn: https://linkedin.example/in/jordan-lee`

   When saved suborganizations exist, append their exact display names and full paths and ask for each member's owning organization and any additional affiliations in this same dump; an omitted owner defaults to root and omitted affiliations remain `none`, with no follow-up. Parse the dump into the existing proposed set. Ask at most one recovery turn for missing required values, using exactly one applicable opening and necessary record-identifying context below it: `**What are the missing full names for these members?**`, `**What are the missing email addresses for these members?**`, or `**What are the missing full names and email addresses for these members?**`. Do not conduct per-field, per-member owner, or affiliation interviews. Begin the cleaned-set operations proposal exactly `Here is the proposed members set:` and show each full node-relative `members/<member-slug>/MEMBER.md` destination. After it is accepted, preserve the existing one-at-a-time `(Recommended)` or batch artifact review; begin a batch artifact proposal exactly `Here is the complete proposed members batch:`. Save each accepted `MEMBER.md` as its own artifact and history entry.
14. Ask the sharing decision exactly as follows:

   > **How would you like to use this GTM workspace repository?**
   >
   > You can keep it on this computer for yourself or share it with a team. Multiplayer can be added later.

   1. Keep it local and single-player on this computer. (Recommended)
   2. Make it multiplayer through a private GitHub repository.

   Keep the required reply line. For multiplayer, check `gh` is installed and authenticated. Guide install or login in single-question steps when needed. Ask the owning GitHub account/organization, propose the repo name, confirm it, create a private repo, and push `main`. At every step include `Cancel and stay local for now` as an option. Never imply local mode lacks history or GitHub sharing is public.
15. Close with a tree-style list of files created, explain they are saved to history, and state whether sharing is local single-player or multiplayer. Then add a short `Recommended next step` paragraph using only the explicit capability/skill catalog supplied by the hosting environment. Normalize only these exact workflow IDs and choose the first listed below that is available, regardless of conversational hints:

   1. `gtm-icp` → `Define the ideal customer profile for <saved organization display name>.`
   2. `gtm-persona` → `Define the buyer personas for <saved organization display name>.`

   Ignore every unrecognized ID. If the catalog is absent, empty, or contains only unrecognized IDs, use the ICP request above as a generic natural-language fallback without claiming that a workflow is installed. Follow the request with one sentence saying the agent will use the saved GTM workspace.

## Import (keyboard surfaces only)

1. Check git before touching the target; use the create flow's guided recovery if missing. Ensure `~/.gtm/` exists.
2. Ask whether the source is a local folder or a GitHub URL. Then ask for that one source. Apply link safety; reject credential-bearing URLs without echoing them.
3. For a local folder, explain that import copies it and leaves the original untouched, then ask the user to confirm that expectation. For GitHub, explain it will clone a separate copy.
4. Inspect the source without changing it. Derive the proposed slug from an existing `ORG.md` H1, then a legacy `org.md` H1, otherwise the source name. Show and confirm the target `~/.gtm/<org-slug>`.
5. Check collision. Offer opening the existing target `(Recommended)`, choosing another slug, or cancelling; never overwrite.
6. Copy the local source or clone the GitHub source into the new target. Preserve available history; leave the local original untouched.
7. Inventory the target recursively against every contract and legacy-migration check. Report what fits and what needs conversion, including loose markdown, lowercase `org.md`, legacy `people/<person-slug>/person.md` or `PERSON.md`, unsafe links, placeholders, collisions, and git health. Members already under a suborganization's canonical `members/` directory are valid.
8. Present exact moves, renames, deletions, boilerplate additions, and complete replacement file contents. Legacy members move to `members/<member-slug>/MEMBER.md` under the same organization node. Run the accept loop on this one conversion proposal.
9. On acceptance, apply only the proposal, initialize git on `main` when needed, set a temporary repo-local identity only when no local identity exists, and save the conversion as one plain-English history entry.
10. Offer the same optional guided multiplayer setup as create. Do not replace a valid existing remote without explicit confirmation.
11. Close with the source left untouched, target path, resulting tree, repairs made, history status, and sharing status.

## Update

1. Resolve the repo, then ask what to update: root organization facts / a suborg / a member / refresh facts from research / structure.
2. Recursively list existing suborganizations or members with their full node-relative paths when the chosen target needs one; ask the user to select. For structure, offer add, rename, or move only where the contract permits it. A member may move between root and any valid suborganization node; within the selected organization, its destination is always `members/<member-slug>/MEMBER.md`.
3. Gather the requested change one question at a time. For refresh, reread existing public links, use fresh public research, and distinguish sourced changes from inference.
4. Show complete before/after content for every affected file and exact path operations. Run the accept loop.
5. On acceptance, apply exactly the proposal, update member `Suborganizations:` references when an accepted suborganization rename requires it, run background git, and close with paths and a plain-English change summary.

## Delete

1. Resolve the repo, then ask what to delete: a member / a suborg / content within a file / the entire organization context.
2. List valid targets with full paths when needed. For a suborganization, include all recursively nested suborganizations and every member, ICP, and persona owned by each deleted node, plus affected `Suborganizations:` lines elsewhere, in the consequence report. Name every owned artifact by its complete repository-relative path; tree indentation does not substitute for the full path. For file content, show the complete resulting file.
3. Explain exact paths that disappear, what affiliation lines change, and recovery. In-repo deletion is recoverable from history. Whole-repo deletion removes the local folder and all local history; a GitHub copy survives and is not deleted.
4. For a member, suborg, or file-content deletion, present exact operations through the normal accept loop. On acceptance, apply the deletions, remove directories made empty by the accepted deletion, and verify every promised target path is absent before running background git and closing with recovery guidance.
5. Whole-repo deletion is keyboard-only: on a fixed-connection surface, use the surface refusal instead of this step. For a whole repo, show the consequence report, then ask the user to type the org slug exactly. A mismatch changes nothing and asks again or offers cancel. An exact match authorizes removal of only the resolved `~/.gtm/<org-slug>` directory; do not run git afterward.
6. Close with what disappeared and how to recover it from history, a surviving remote, or re-import as applicable.

## Doctor

1. Resolve the repo and inspect every item in `contract.md`'s doctor checklist without changing anything. Traverse organization nodes recursively and inventory canonical and legacy member paths at every depth.
2. Report all healthy checks and every defect in plain English. Include exact paths, git status, and remote sync status when a remote exists; never expose credential-bearing URLs.
3. If healthy, say so, change nothing, and close with a clean bill of health.
4. If defective, propose exact path operations and complete replacement contents. Explain any destructive consequence and run the accept loop on the whole repair set.
5. On acceptance, apply only approved fixes. Keep each canonical member at its owning node, migrate legacy paths under the same node, preserve facts, remove machine state/placeholders, restore contract files, and normalize safe slugs. Do not treat the temporary local identity as a defect.
6. Stage the repair set, inspect it, and save it once as `Repair GTM workspace repo`. Run remote pull/rebase/push when applicable. Close by rerunning the checklist and reporting the resulting health.

## Git problem patterns

Use the same one-question form for each interruption:

- Missing git: guided install `(Recommended)` / cancel.
- Uncommitted unrelated work: include it in the preview / leave it untouched and save only accepted paths `(Recommended)` / cancel.
- Pull conflict or diverged history: stop and explain that local and shared edits overlap; guide a careful review `(Recommended)` / stay local for now / cancel. Never resolve by discarding or force-pushing.
- Authentication or rejected push: sign in and retry `(Recommended)` / stay local for now / cancel.
- Missing or invalid remote: repair the remote with a confirmed public-safe URL `(Recommended)` / stay local / cancel.
- Environment cannot durably save an accepted operation: render `**How would you like to proceed?**`; below it explain in plain English what could not be saved and why; then offer completing it from the CLI at a keyboard `(Recommended)` / cancel. Never report the change as saved.

End every discrete list exactly with `Reply with a number, or type your answer.`
