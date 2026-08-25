# GTM workflow conversation standard

This is the chosen user-facing quality bar for every workflow flow. Implementation stays rigorous, but the default conversation uses the operator's business language.

## Default level

Answer these operating questions before exposing implementation detail:

1. What will the workflow do?
2. What will it read or change?
3. When will it run?
4. Where will it save results?
5. What happens when part of it fails?

Describe location as `on this computer` or `on Vercel`. Explain scheduled and triggered local behavior by saying it runs only when the user or their agent asks. Explain Vercel research cost as use of the user's budgeted Vercel AI Gateway credits rather than their CLI-agent subscription.

Read the user's request and managed workflow files before asking questions. Ask only for missing business decisions that change purpose, inputs, result, timing, systems changed, volume or cost limit, or meaningful failure behavior. Group compatible gaps into one compact reply. Rephrase unavoidable technical choices by their effect.

Name an implementation detail only when it changes cost, permission, safety, ownership, or what will happen. If the user asks for code, storage, models, logs, architecture, developer detail, or a technical diagram, answer accurately from tracked implementation and runtime state. In technical inspection, label provenance as `Tracked implementation` or `Ignored run state`.

Keep run IDs, project and team identifiers, environment-variable names, branch names, and persistence commands in saved files or internal diagnostics by default. Reveal an identifier when the user asks for developer detail or when it is the only safe way to disambiguate a consequential action.

Every question-bearing message begins with exactly one bold question as its first non-empty line. Put workspace status, notes, explanations, and proposals below that question. Render discrete choices as a numbered list with at most option 1 marked `(Recommended)`. End every discrete choice block exactly:

```text
Reply with a number, or type your answer.
```

Never use `AskUserQuestion`.

## Proposal and approval

Before a durable change, begin the proposal turn with `**Would you like to save these changes?**`, then show a concise proposal with:

- behavior in plain language;
- inputs, outputs, and external systems that may change;
- whether it runs on this computer or on Vercel;
- timing and accepted caps;
- result destination;
- failure and partial-result behavior;
- validation and pilot evidence;
- a short list of file groups to add, change, move, or remove; and
- local, draft, or live state after saving.

Do not put source code, schemas, fixtures, configuration bodies, diffs, ignore-file contents, or complete file bodies in the default proposal. Group the workflow project when listing every filename would only expose stack detail. Before approval, inspect the complete draft and actual diff, verify the summary and path list, and hold those exact bytes unchanged through the accepted write.

Put the numbered options and reply line after the proposal:

```text
**Would you like to save these changes?**

<concise proposal>

1. Accept and save (Recommended)
2. Change it
3. Cancel

Reply with a number, or type your answer.
```

A change response asks only `**What would you like me to change?**`, updates the draft, reruns validation, and presents the revised proposal. Cancellation writes no tracked byte. An explicit request for technical detail may reveal the requested files or diff without weakening acceptance, deployment, external-write, cost, or deletion gates.

## Business diagrams

For `show me the workflow`, render a Mermaid business-process diagram with four to eight primary nodes. Use labels an operator would say aloud. Show a branch only for a user choice or materially different business outcome. Hide retries, schemas, storage writes, model settings, process state, telemetry, and internal loops.

Add a short caption stating what starts the workflow, what it reads or changes, what it saves, and how partial failures appear. Add one short failure note when relevant. Offer an implementation diagram only after an explicit technical request.

## Outcome reports

Lead run completion with the business result and the exact form `<n> completed, <m> failed`. Follow with the result itself or the saved result path. Say whether any external system changed, whether results were posted, and `saved locally` for the JSON result. Show cost or usage when it matters to an accepted cap.

Keep internal diagnostics, ports, process controls, token counts, and telemetry under optional technical detail. A shell command is supporting detail, not the main handoff. Describe clean persistence as `saved to history` without naming the branch.
