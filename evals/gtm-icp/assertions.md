# gtm-icp requirements and assertions

All assertions below are contractual unless marked diagnostic. The old `gtm-define-icp` skill supplied only the intent to define and refine an ICP; none of its text, fixed schema, operator model, inheritance, or promotion behavior is carried forward.

## Shared contract

- **C01** Resolve a repo in this order: request-named, environment-connected, otherwise enumerate valid `~/.gtm/` repos and ask.
- **C02** Once a workspace is resolved, the context line is `Using GTM workspace: <root display name>` directly under the keyboard opener (`**Save this?**`) or the bold lead question, and `For <root display name>:` as the first line of a hosted approval summary. It always names the root and never carries a visible-artifact count.
- **C03** Visibility is node-local: root never sees suborg ICPs, and a targeted suborg never sees root or sibling ICPs.
- **C04** Every question-bearing message is one grouped message: one bold lead question first, the remaining facts wanted as a bulleted list, at most one numbered choice block with at most one first-position `(Recommended)`, and the exact line `Reply with a number, or type your answer.` only when that block is present. Never use `AskUserQuestion`.
- **C05** Apply link safety before opening or echoing a source. Unsafe URLs are represented only by a plain source label.
- **C06** Every durable change is described before writing as a short plain-language proposal: each artifact by display name plus owner chain (`National Insurers (Nimbus Labs › Nimbus Enterprise)`) with its criteria and disqualifiers; updates state changed facts as `was X, now Y`; deletions state the name and effect. Complete files, before-and-after bytes, and fenced content never appear unless asked. On a keyboard the proposal is `**Save this?**`, the context line, the summary, then `1. Save (Recommended)`, `2. Change it`, `3. Cancel`; on a hosted surface with a native approval control the whole proposal is that control's approval text, first line `For <root display name>:`, last line `Approve to save, or Cancel and tell me what to change.`, with no proposal message or numbered accept before the call.
- **C07** Accepted writes stay on `main`, stage only accepted paths, never force-push, and close with each artifact by identity and `Saved.` Git failures become plain-English numbered recovery choices.
- **C08** No cwd-derived position, git-identity operator, `Working in … as`, machine state, artifact inheritance, fixed section schema, or migration behavior appears.
- **C09** New ICPs use `icps/<slug>/ICP.md` and remain factual, flat, small, freeform Markdown; legacy `icps/<slug>.md` remains readable and editable without migration.
- **C10** Qualified labels (`<org-path>/<slug>` off-root, bare `<slug>` at root) are internal identifiers for overlap checks and never appear in user-facing text.
- **C11** An environment-declared durable-write mechanism replaces only the Git mechanism; an unavailable durable save leaves the repo unchanged and produces one direct recovery question without a success claim.
- **C12** No banned plumbing language appears in an ICP content flow: git, GitHub, commit, push, pull request, branch, hash, SHA, repository or file path, file name, qualified label, manifest, tool name, or "saved to history". Doctor reports may name a slug or path only for an artifact with no display-name heading or owning node.
- **C13** Several supplied ICPs are drafted together, presented in one proposal, and saved in one history entry. No suggest or brainstorm step exists.

## Branch contract

- **B01 Guided menu:** no clear verb retains ownership and offers create, update, delete, or doctor; no import, clear, suggest, or brainstorm branch exists.
- **B02 Create destination:** no suborgs means root without a question; any suborg means ask which organization owns the ICP, root first as `(Recommended)`, unless the request names an org. The choice may be the one numbered block of the grouped intake.
- **B03 Create grounding:** read the destination org chain and only destination-local ICPs, avoid near-duplicates, ask every missing result-changing fact in one grouped message (or nothing when the facts were supplied), propose each ICP by identity with its criteria and disqualifiers, then write and save all accepted ICPs together.
- **B04 Update:** list only visible ICPs by identity when selection is needed, gather the change in one message, propose the changed facts as `was X, now Y`, preserve unrelated facts, then save one accepted change.
- **B05 Delete:** list only visible targets by identity, name the ICP by identity, warn that the definition will no longer be available from that node, say it can be restored on request, save the deletion, and close with `Saved.`
- **B06 Doctor:** inspect only ICP concerns repo-wide: placement next to `ORG.md`, lowercase-kebab slugs, display-name H1, matchable substance, and placeholder/TODO husks. Ignore persona content. Repairs are described in words and accepted as one commit.
- **B07 Template:** ship `templates/icp.md` only as a draft starting shape; valid ICPs need not follow it.
- **B08 Description:** third-person model-invoked description starts `Triggers when`, includes create/update/delete/doctor, and excludes personas and repo-level management.
- **B09 Sibling boundary:** persona, teammate, workspace-lifecycle, account-research, segmentation, and scoring outcomes do not mutate ICP artifacts or enter the ICP menu.
- **B10 Hosted approval:** with a native approval control declared, the control's request carries the whole proposal as `summary`; the grader reads the stand-in's `approvals.jsonl`, requires one entry, the `For <root>:` first line, the closing line, and no `Save this?` or numbered accept block in the transcript.

## Scenario coverage

- E1 proves guided-menu ownership, repo enumeration, one grouped intake, root create, local source use, unsafe-link handling, the keyboard proposal shape, acceptance, and the `Saved.` close.
- E2 proves the create-destination rule, suborg-only visibility, the identity string with an owner chain, and near-duplicate grounding.
- E3 proves explicit root targeting, the reverse visibility direction, a `was X, now Y` update proposal, and byte preservation.
- E4 proves the one-obvious-node default, delete consequences by identity, restore guidance, and exact deletion without paths.
- E5 proves repo-wide ICP doctor scope, all owned checks, ignored persona defects, and one repair commit.
- E6 proves the persona near-miss routes to `gtm-persona` without reading or mutating ICPs.
- E7 proves hosted durable-save failure recovery and byte-preserved cancellation.
- E8 proves batching: three supplied ICPs, no intake question, one proposal, one save.
- E9 proves the hosted native-approval path: the summary is the entire proposal and the only gate.
