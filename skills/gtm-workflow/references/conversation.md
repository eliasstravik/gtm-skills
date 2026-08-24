# GTM workflow conversation standard

This is the chosen user-facing quality bar for every workflow flow. Implementation stays rigorous, but the default conversation uses the operator's business language.

## Default level

Answer these operating questions before exposing implementation detail:

1. What will the workflow do?
2. What will it read or change?
3. When will it run?
4. Where will it save results?
5. What happens when part of it fails?

Use `Local` or `runs on this computer` for the local target. Describe other choices as a connected app or an automatic scheduled or triggered service. Let saved target prose choose the programming language, storage engine, model settings, process lifetime, output encoding, schema, and local service.

Read the user's request and the saved registry before asking questions. Ask only for missing business decisions that change purpose, inputs, result, timing, systems changed, volume or cost limit, or meaningful failure behavior. When several gaps are compatible, ask for them in one compact reply instead of serial turns. Rephrase an unavoidable technical choice by its effect, such as whether each run refreshes prior results or reuses them.

Name an implementation detail only when it changes cost, permission, safety, ownership, or what will happen. If the user asks for code, storage, models, logs, architecture, developer details, or a technical diagram, answer accurately using the registry, implementation, and runtime records. In a technical inspection, label provenance as `Tracked implementation` or `Ignored run state` so the user can distinguish durable design from one run's diagnostics.

Keep workflow IDs, target pointers, environment-variable names, branch names, and persistence commands in the saved record or internal diagnostics by default. Refer to the user-named workflow, connection, and saved history in chat. Reveal an identifier when the user asks for developer details or when it is the only safe way to disambiguate the object before a consequential action.

## Proposal and approval

Before a durable change, show a concise proposal with:

- behavior in plain language;
- inputs, outputs, and external systems that may change;
- local, connected-app, or automatic location;
- run timing and accepted limits;
- failure and partial-result behavior;
- validation already performed;
- a short list of workflow records and file groups to add, change, move, or remove; and
- local, draft, or live state after saving.

Do not put source code, schemas, fixtures, tests, configuration bodies, diffs, ignore-file contents, or complete file bodies in the default proposal. Group implementation and test files by workflow folder when listing every filename would only expose stack detail. Before asking for approval, inspect the complete internal draft and actual diff, verify that the summary and path list match it, and hold those exact bytes unchanged through the accepted write. A change response updates the draft, reruns validation, and shows a revised summary. An explicit request for technical details may reveal the requested files or diff without weakening approval, external-write, cost, publishing, or deletion gates.

Use this acceptance block:

```text
**Would you like to save these changes?**

1. Accept and save (Recommended)
2. Change it
3. Cancel

Reply with a number, or type your answer.
```

## Business diagrams

For `show me the workflow`, render a Mermaid business-process diagram with four to eight primary nodes. Use labels an operator would say aloud. Show a branch only for a user choice or a materially different business outcome. Hide retries, schemas, database operations, storage writes as implementation steps, model settings, process state, telemetry, and internal loops.

Add a short caption that says what starts the workflow, what it reads or changes, what it saves, and how partial failures appear. Add one short failure note when relevant. For example, a company-research workflow may continue after an unreachable website and list that company in the report. Offer an implementation diagram only after an explicit technical request.

## Outcome reports and links

Lead run completion with the business result and the explicit form `<n> completed, <m> failed`, followed by the result itself or a human-readable link. Say whether any external system changed. Say `saved locally` for local data. Show cost or usage when it matters to an accepted limit.

Keep internal run identifiers, database filenames, product names for local viewers, ports, raw filesystem paths, token counts, process controls, and telemetry under optional technical details. Label a result link `Open saved results` or `Open workflow data`. When sharing a private viewer, give the private link, state who can access it, and offer to stop sharing later. A shell command is supporting technical detail, not the main handoff. Describe clean persistence as `saved to history` without naming the branch.
