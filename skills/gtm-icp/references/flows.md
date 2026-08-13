# ICP manager flows

Apply the matched branch after loading `context.md`.

## Guided menu

> **What would you like to do with your ideal customer profiles?**

An ICP is a saved description of the accounts that fit or do not fit an organization.

1. Create an ICP (Recommended)
2. Update an ICP
3. Delete an ICP
4. Doctor the ICP library

`Reply with a number, or type your answer.`

Retain ownership and continue into the selected branch. There is no import or clear branch.

## Create

1. Resolve the repo and create destination using `context.md`; the destination question happens before reading any ICP.
2. Read the root-to-destination `org.md` chain and only the destination node's existing ICPs. State the context line.
3. Extract all facts already supplied. Ask one bold freeform question at a time only for missing information needed to say what an account could match or fail: display name, account traits, fit signals or buying context, disqualifiers, and honest open questions.
4. If the user supplied sources, apply link safety and inspect safe sources. Do not require research.
5. Check destination-local ICPs for a near-duplicate. When overlap is material, explain the overlap and ask whether to update the existing ICP `(Recommended)` or continue with a distinct new one.
6. Draft `icps/<slug>.md` from supplied and safely sourced facts. Preserve disqualifiers semantically and keep uncertainty explicit. Use the template only as a starting shape.
7. Show the target path and complete Markdown, then run the accept/change/cancel loop.
8. On acceptance, create only the needed `icps/` directory and accepted file. Run persistence, then close with path, owner, qualified label, factual summary, and “saved to history.”

## Update

1. Resolve the repo and target under the artifact-reading node rule. State the context line.
2. If more than one ICP is visible and none was named, list only those visible ICPs and ask which to update.
3. Read the target ICP and root-to-target org chain. Gather the requested change one question at a time; do not broaden it.
4. Preserve unrelated facts and freeform headings. Show the path plus complete before and after Markdown, then run the accept loop.
5. On acceptance, write exactly the after bytes and run persistence. Close with the qualified label, exact change summary, and “saved to history.”

## Delete

1. Resolve the repo and target under the artifact-reading node rule. State the context line.
2. If more than one ICP is visible and none was named, list only visible ICPs and ask which to delete.
3. Show a consequence proposal naming the owning node, qualified label, exact file path, and that the definition will no longer be available from that node. Explain recovery from history.
4. Run the accept loop on the exact deletion. On acceptance, delete only that file and remove `icps/` if it becomes empty.
5. Run persistence. Close with what disappeared, qualified label, “saved to history,” and plain recovery guidance without commands or hashes.

## Doctor

1. Scan every `icps/` directory in the repo, including stray ones; this integrity pass is intentionally repo-wide. Do not inspect or repair persona content.
2. Report healthy checks and every ICP defect: an `icps/` directory whose parent lacks `org.md`, a non-lowercase-kebab filename, a missing display-name H1, a file that says nothing an account could match or fail, or a placeholder/TODO husk.
3. A freeform file is healthy without matching the template. Preserve useful facts when renaming or restoring an H1; never invent substance to rescue a husk.
4. If healthy, change nothing and close with the complete ICP health report.
5. If defective, show all exact path operations and complete replacement bytes as one proposal, state that non-ICP files stay untouched, and run the accept loop.
6. On acceptance, apply only the proposal and save the entire repair set once as `Repair ICP artifacts`. Rerun the ICP checks and close with the resulting health plus “saved to history.”
