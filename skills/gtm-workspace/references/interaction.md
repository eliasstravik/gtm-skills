# Shared interaction standard

Every GTM skill applies this standard to its user-facing messages. Skill-specific vocabulary stays in each skill; this file owns audience, proposal shape, batching, questions, approval by surface, closing language, and the connection-step carve-out.

## Contents

- [Audience and language](#audience-and-language)
- [Proposal shape](#proposal-shape)
- [Batching](#batching)
- [Questions](#questions)
- [Approval by surface](#approval-by-surface)
- [Closing](#closing)
- [Connection steps carve-out](#connection-steps-carve-out)

## Audience and language

Write for a non-technical GTM teammate. Use business words: organization, member, ICP, persona, workflow, run, cost. No technical detail, name, or link appears unless it is absolutely necessary for the user to act. Examples of what therefore stays out of every user-facing message of these flows: git, GitHub, commit, push, pull request, PR, branch, main, hash, SHA, repository path, file path, file name, qualified label, manifest, tool names, third-party host names (say "hosted" or "production"), URLs to the workspace repository, and the phrase "saved to history". Say `Saved.` Recovery is "you can ask me to restore it", with no commands or hashes.

Identify every artifact and organization node by its display name plus its full owner chain in parentheses, separated by `›`: `Revenue Leader (Beacon Yards)` for a root-owned artifact, `National Insurers (Nimbus Labs › Enterprise)` below root, and `Enterprise (Nimbus Labs)` for a suborganization node itself. Two same-named items are told apart by their owner chains; only when the chains are also identical, append the slug after the chain for those two, `Revenue Leader (Beacon Yards, revenue-leader-2)`. The `›` separator is punctuation and is used on every surface.

The environment's own failure and unknown-outcome reports may keep precise wording.

## Proposal shape

Present one proposal per coherent batch. For each artifact, give its identity (display name plus owner chain, always) and two to four lines stating the facts that define it:

- ICP: the account criteria and disqualifiers.
- Persona: role, responsibilities, authority.
- Organization: what is known and how many fields are still unknown.
- Member: name, role, email.
- Workflow: what it does, where it runs, what it costs per run, what it writes, then the fixed scope phrases `and its result table` when a table is created and `plus the workflow project's standard files` on the first workflow save. A hosted save also carries `Saving this also puts it live in production.`

For an update, state the changed facts only, each written `was X, now Y`. For a deletion, give the name and that it will no longer be available. For a destructive workflow migration, name the table or column and the number of rows affected in words.

Never include complete files, before-and-after bytes, diffs, code, schemas, or SQL by default. When the user asks to see the full draft, show it once and return to the summary shape.

## Batching

When the user supplies several items in one or more messages, draft all of them and present one proposal. The save writes every accepted artifact in one durable change with one plain history entry such as `Add 3 personas`. No skill offers a suggest or brainstorm step; with no supplied facts, the skill asks its grouped intake question below.

Splitting follows artifact boundaries only: ICPs, personas, members, and suborganization organization files may be split across parts; a workflow save (source, table, migration SQL, journal, snapshot) is never split; the first part of a workspace create always carries the root organization and the standard setup files. A workflow summary is bounded by construction (one workflow, one table, a handful of stages); if it would exceed the limit, trim prose, never scope, and never split.

## Questions

Ask only for a missing decision or fact that changes the result. Put every such question in one message: one bold lead question first, then the remaining facts wanted as a bulleted list (never numbered), each on one line with a fictional example where the flow already has one. At most one numbered choice block per message; only choice options are numbered, at most option 1 ends with `(Recommended)`, and the block ends exactly `Reply with a number, or type your answer.` A message with no choice block has no reply line.

Do not ask for facts the agent can research or leave as `Unknown`. Do not use `AskUserQuestion` or a host question tool.

## Approval by surface

Determine the surface from the environment's declarations.

**Keyboard surface** (no native approval control declared). The proposal message opens `**Save this?**`, then the context line `Using GTM workspace: <root display name>`, then the summary, then:

```text
1. Save (Recommended)
2. Change it
3. Cancel

Reply with a number, or type your answer.
```

On 1, save without asking anything else. On 2, ask `**What would you like me to change?**`, revise, and show one revised proposal. On 3, write nothing.

**Hosted surface with a native approval control** (the environment declares one). Write no separate proposal message. Put the entire proposal in the approval-gated control's approval text (`summary`) as plain text: newlines allowed, no Markdown emphasis, headings, fences, tables, or arrows; changes written in words, `was X, now Y`. Its first line is `For <root display name>:` (or `For <root display name> (part <i> of <N>):` when split), naming the root only; then the summary; then the closing line for that action:

- Save: `Approve to save, or Cancel and tell me what to change.`
- Run start: `Approve to run, or Cancel and tell me what to change.`
- Checkpoint continue: `Approve to continue the run, or Cancel to leave it paused and tell me what to do.`
- Stop a paused run: `Approve to stop the run here, or Cancel to leave it paused.`
- Cancel a live run: `Approve to stop the run, or Cancel to leave it running.`

The model message that carries the control call contains no text and no other tool call; read-only work earlier in the same turn (reading the checkout version, validation, the dry run, research) is allowed and expected, and so is preparing the draft outside the workspace so the request already carries everything it needs. The environment renders that text with Approve and Cancel; that is the only gate, with no numbered accept step. On denial, write nothing and ask `**What would you like me to change?**`; a reply of "cancel" or "no" ends the flow with nothing written.

If the proposal does not fit the environment's declared approval-text limit while naming every artifact and effect, split it along the batching boundaries above, use the part form as the first line of each, and request them one at a time. Count-only summaries are never acceptable because the gate must state exact scope. The first create proposal names the organization and says `plus the workspace's standard setup files` for the boilerplate files, which are never named.

Bold questions in ordinary messages (for example `**What would you like me to change?**`) are unchanged on both surfaces because those are posted as normal messages. On a hosted surface, grouped questions carry `Using GTM workspace: <root display name>` under the lead question. The context line is omitted whenever no workspace is resolved yet.

## Closing

Close in one or two lines: what was created, changed, or removed, by identity, then `Saved.` No paths, no URLs, no history vocabulary, no commands. For a hosted workflow, add `It will be live in production in a few minutes; ask me to check.` When asked, the agent checks the production deployment and answers `Live.` or `Not yet live.`

Run outcomes keep the workflow skill's business report (rows, hit rate, cost) with no commands or run identifiers. At a checkpoint on a hosted surface, that report (rows done, failures, hit rate, spend so far, projection for the rest, and `Cancel, then ask me to show the saved rows before deciding`) is the `summary` of the approve action with its closing line, and no text precedes it. On a keyboard it is a text report followed by:

```text
1. Continue (Recommended)
2. Stop here
3. Show me the saved rows first

Reply with a number, or type your answer.
```

## Connection steps carve-out

Import, sharing setup, whole-workspace deletion, and git-problem recovery are keyboard-only steps whose subject is the repository itself. They may name GitHub, the repository, and the folder. Nothing else may. Doctor reports, repair proposals, and import conversion proposals may name the slug or path of an artifact that has no display-name heading or no owning node, because nothing else identifies it.
