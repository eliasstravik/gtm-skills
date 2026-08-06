# Persona manager flows

Apply the matched branch after loading `context.md`.

## Guided menu

> **What would you like to do with your buyer and stakeholder personas?**

A persona is a saved description of the people who match or do not match an organization's buying context.

1. Create a persona (Recommended)
2. Update a persona
3. Delete a persona
4. Doctor the persona library

`Reply with a number, or type your answer.`

Retain ownership and continue into the selected branch. There is no import or clear branch.

## Create

1. Resolve the repo and create destination using `context.md`; the destination question happens before reading any persona.
2. Read the root-to-destination `org.md` chain and only the destination node's existing personas. State the context line.
3. Extract all facts already supplied. Ask one bold freeform question at a time only for missing information needed to say what a lead could match or fail: display name, responsibilities and scope, buying context or influence, authority boundaries, disqualifiers, and honest open questions.
4. If the user supplied sources, apply link safety and inspect safe sources. Do not require research.
5. Check destination-local personas for a near-duplicate. When overlap is material, explain it in chat and ask whether to update the existing persona `(Recommended)` or continue with a distinct new one.
6. Draft `personas/<slug>.md` from supplied and safely sourced facts. Preserve authority boundaries and disqualifiers semantically, keep uncertainty explicit, and do not persist the adjacent-persona comparison by default. Use the template only as a starting shape.
7. Show the target path and complete Markdown, then run the accept/change/cancel loop.
8. On acceptance, create only the needed `personas/` directory and accepted file. Run persistence, then close with path, owner, qualified label, factual summary, and “saved to history.”

## Update

1. Resolve the repo and target under the artifact-reading node rule. State the context line.
2. If more than one persona is visible and none was named, list only those visible personas and ask which to update.
3. Read the target persona and root-to-target org chain. Gather the requested change one question at a time; do not broaden it.
4. Preserve unrelated facts and freeform headings. Show the path plus complete before and after Markdown, then run the accept loop.
5. On acceptance, write exactly the after bytes and run persistence. Close with the qualified label, exact change summary, and “saved to history.”

## Delete

1. Resolve the repo and target under the artifact-reading node rule. State the context line.
2. If more than one persona is visible and none was named, list only visible personas and ask which to delete.
3. Show a consequence proposal naming the owning node, qualified label, exact file path, and that downstream lead segmentation and scoring will no longer see the label. Explain recovery from history.
4. Run the accept loop on the exact deletion. On acceptance, delete only that file and remove `personas/` if it becomes empty.
5. Run persistence. Close with what disappeared, qualified label, “saved to history,” and plain recovery guidance without commands or hashes.

## Doctor

1. Scan every `personas/` directory in the repo, including stray ones; this integrity pass is intentionally repo-wide. Do not inspect or repair ICP content.
2. Report healthy checks and every persona defect: a `personas/` directory whose parent lacks `org.md`, a non-lowercase-kebab filename, a missing display-name H1, a file that says nothing a lead could match or fail, or a placeholder/TODO husk.
3. A freeform file is healthy without matching the template. Preserve useful facts when renaming or restoring an H1; never invent substance to rescue a husk.
4. If healthy, change nothing and close with the complete persona health report.
5. If defective, show all exact path operations and complete replacement bytes as one proposal, state that non-persona files stay untouched, and run the accept loop.
6. On acceptance, apply only the proposal and save the entire repair set once as `Repair Persona artifacts`. Rerun the persona checks and close with the resulting health plus “saved to history.”
