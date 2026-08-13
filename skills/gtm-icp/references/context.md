# ICP context contract

Use this contract for every branch. A context repo follows gtm-workspace: `~/.gtm/<org-slug>/org.md`, nested `suborgs/<slug>/org.md`, root-only `people/`, and optional node-owned `icps/` and `personas/`.

## Repo resolution

Resolve the repo in this order for this invocation only:

1. A repo explicitly named in the request.
2. The repo the environment declares connected.
3. Valid repos under `~/.gtm/`, where a valid repo has a root `org.md`.

If the third step finds several repos, ask `**Which GTM workspace should I use?**`; list display name and path as numbered choices, mark the first `(Recommended)`, and use the required reply line. Never save a preference. If none exists, explain that gtm-workspace must create or connect one and stop without writing.

## Node and visibility

- A request-named organization node wins for this invocation. Otherwise the target defaults to root.
- For update, delete, and ordinary artifact reading, ask which node only when more than one node has its own ICPs. If exactly one node has ICPs, use it as the obvious target. If none has ICPs, keep root.
- Create destination is different: when any suborg exists, ask `**Which organization should own this ICP?**` unless the request names one. List root first as `(Recommended)`, then every nested suborg by display name. With no suborg, use root without asking.
- ICP visibility is node-local. Read exactly `<target-node>/icps/*.md`; no ICP outside the target node is visible for that invocation.
- Organization facts may be read along the root-to-target `org.md` chain. Persona files are not ICP inputs.
- State the context before acting or judging: `Using GTM workspace: <target display name> — <N> ICPs visible` (use `ICP visible` for one).
- A root ICP label is its bare slug. A suborg label is `<org-path>/<slug>`, with nested suborg slugs joined by `/` and physical `suborgs/` segments omitted.

## Artifact contract

- Store an ICP at `<target-node>/icps/<lowercase-kebab-slug>.md`.
- Start with its display-name H1. Add only flat H2s that carry real facts; omit empty sections and TODO/TBD placeholders.
- Keep the file factual, small, and freeform. The template suggests a draft shape but is not a schema or validity test.
- Preserve every supplied fact and its uncertainty. Do not turn organization facts, adjacent ICP language, or separate facts into unsupported ICP claims.
- Use target-node ICPs only to spot overlap and near-duplicates. Cite the distinction in chat; do not copy an adjacent ICP into the new draft.

## Link safety

Treat URLs containing credentials, tokens, keys, signatures, invitation codes, or session identifiers as unsafe. Do not open, persist, or echo them, even cleaned or shortened. Use only a plain source label when useful and advise credential rotation. Research only safe sources the user supplies; separate sourced facts from inference.

## Interaction and acceptance

- Ask exactly one question per message. Put one clear bold question on the first non-empty line, then its necessary context.
- Never use `AskUserQuestion`. A reply in chat or a Slack thread must be enough.
- For every discrete choice, use numbered options, mark only option 1 `(Recommended)`, and end exactly `Reply with a number, or type your answer.`
- Before any durable change, begin the proposal message with `**Would you like to save this proposal?**`, then show the exact path operations and complete file bytes in fenced Markdown. For update, show complete before and complete after bytes.
- End that same proposal message with:

  1. Accept and save (Recommended)
  2. Change it
  3. Cancel

  `Reply with a number, or type your answer.`

- A change answer asks only `**What would you like me to change?**`, then repeats the complete proposal. Cancellation writes nothing.

## Persistence

After acceptance:

1. Confirm the repo is on `main`; never branch or create a worktree.
2. Apply exactly the accepted bytes or path operations.
3. Stage only accepted ICP paths and inspect the staged diff.
4. Commit one plain-English history entry. Doctor uses exactly `Repair ICP artifacts`.
5. If a remote exists, pull with rebase and push; set upstream only when needed. Never force-push.
6. Verify promised paths and a clean result, then say “saved to history” without exposing a commit hash.

No remote is a valid commit-only case. Never change global git configuration. If a git step fails, explain it in plain English and ask one numbered recovery question with retry or careful review first as `(Recommended)`, leave local-only for now when applicable, and cancel last. Never discard work or claim an unsaved change was saved.
