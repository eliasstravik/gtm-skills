# ICP lifecycle flows

Apply the selected flow after loading `contract.md`.

## Guided menu

When no lifecycle verb is clear, explain that an ICP is a saved definition of accounts that fit or do not fit an organization, then render this exact block and continue into the selected flow. There is no import or clear branch.

```text
**What would you like to do with your ideal customer profiles?**

1. Create an ICP (Recommended)
2. Update an ICP
3. Delete an ICP
4. Doctor the ICP library

Reply with a number, or type your answer.
```

## Create

1. Resolve the workspace and create owner. Make the owner choice before reading any ICP.
2. Read the root-to-owner `ORG.md` chain and only owner-local ICPs, then state the context line.
3. Extract supplied facts before asking anything. Ask one freeform question at a time only for facts needed to make the ICP matchable: display name, account traits, fit signals or buying context, disqualifiers, and material unknowns.
4. Apply link safety to supplied sources. Research is optional.
5. Compare only owner-local ICPs for material overlap. If a near-duplicate exists, explain it and ask whether to update the existing ICP `(Recommended)` or continue with a distinct definition.
6. Draft `icps/<slug>/ICP.md` from accepted or safely sourced facts. Preserve uncertainty and disqualifiers; omit unsupported and empty sections.
7. Begin the proposal turn with `**Would you like to save this proposal?**`; place the required context line and any overlap explanation below that question when they share the turn, then show the exact target and complete Markdown through the accept/change/cancel loop.
8. After acceptance, create only the needed `icps/<slug>/` directory and `ICP.md`, persist the accepted change, and close with path, owner, qualified label, factual summary, and “saved to history.”

## Update

1. Resolve the workspace and target under the artifact-reading node rule, then state the context line with the owning node's display name, never the repo root's name for a suborganization target.
2. If several ICPs are visible and none was named, list only those visible ICPs and ask which one to update.
3. Read the target and `ORG.md` chain. Gather only the requested change and preserve unrelated facts and freeform headings.
4. Begin the proposal turn with `**Would you like to save this proposal?**`, then preview the path plus complete before and after Markdown through the accept loop.
5. After acceptance, write exactly the after bytes, persist only that ICP, and close with the qualified label, exact change summary, and “saved to history.”

## Delete

1. Resolve the workspace and target under the artifact-reading node rule, then state the context line with the owning node's display name, never the repo root's name for a suborganization target.
2. If several ICPs are visible and none was named, list only those visible ICPs and ask which one to delete.
3. Begin the proposal turn with `**Would you like to save this proposal?**`, then preview the owning node, qualified label, exact file path, and that the definition will no longer be available from that node. Explain recovery from history.
4. Run the accept loop on the exact deletion. After acceptance, delete only that file, remove its artifact directory if empty, and remove `icps/` if the accepted deletion makes it empty.
5. Persist the deletion and close with what disappeared, its qualified label, “saved to history,” and plain recovery guidance without commands or hashes.

## Doctor

1. Scan every `icps/` directory in the repo, including stray placements. Do not inspect or repair persona content.
2. Report healthy checks and every ICP defect: canonical `icps/<slug>/ICP.md` whose `icps/` owner lacks `ORG.md`, a canonical directory slug that is not lowercase kebab-case, a canonical filename other than `ICP.md`, a missing display-name H1, content with no account-matchable fact, a placeholder/TODO husk, or a canonical/legacy slug collision. Treat a legacy `icps/<slug>.md` as compatible when its owner, slug, H1, and substance are healthy.
3. Treat freeform files as healthy without template conformity. Preserve useful facts while renaming or restoring an H1; never invent substance to rescue a husk.
4. If healthy, change nothing and close with the complete health report.
5. If defective, begin the proposal turn with `**Would you like to save this proposal?**`, then preview all exact ICP path operations and complete replacement bytes as one proposal, state that non-ICP files remain untouched, and run the accept loop.
6. After acceptance, apply only the proposal, save the set once as `Repair ICP artifacts`, rerun every check, and close with resulting health and “saved to history.”

## Sibling and runtime boundaries

- A persona lifecycle request belongs to `gtm-persona`; a member or workspace-structure lifecycle request belongs to `gtm-workspace`. Make that handoff before resolving a workspace or reading artifacts. Account research, segmentation, or scoring may read ICPs but must not route here unless the requested outcome also changes an ICP.
- If the environment declares that it cannot durably save, preserve the exact repo state and use `contract.md` recovery. If it declares another durable mechanism, use it without adding a remote or treating the missing remote as a defect.
