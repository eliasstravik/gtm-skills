---
name: gtm-define-personas
description: Triggers when a user asks to create, define, or refine a buyer or stakeholder persona in a GTM context repository.
---

# Define a Persona

## Recipe

1. Resolve the supplied `$GTM_HOME/state.json` to the active project, canonical org path, and person; never access or modify `~/.gtm` or `state.json`.
2. Read and report the root-to-target `org.md` chain, resolved `person.md`, and every ICP and persona visible at the target through inheritance.
3. Infer the persona's owning altitude from the offer, ICP, and evidence; if it differs from the active org or remains ambiguous, explain why and confirm the canonical org path and lowercase kebab-case persona id before drafting.
4. Echo `Working in <project>/<canonical-org-path> as <person>` after altitude is settled.
5. Draft one `<target-org>/personas/<persona-id>.md` with one H1 and these H2s in order: `Identity`, `Titles And Responsibilities`, `Buying Role`, `Pains And Priorities`, `Objections And Disqualifiers`, `Outreach Hooks`, `ICP Relevance`, `Evidence And Confidence`, `Review Needs`, `Open Questions`.
6. Record `Display name` and `Qualified label` under `Identity`; label root personas `<persona-id>` and child personas `<canonical-org-path>/<persona-id>`, keep known ICP labels in `ICP Relevance`, and express bad-fit or no-match contacts as disqualifier guidance rather than persona files.
7. Preserve sourced facts, constraints, confidence, review needs, and open questions without invention or loss of specificity; retain existing human-authored sections after the core exactly unless explicitly asked to edit them.
8. Before writing, show the target path, purpose, complete exact Markdown, and no-external-side-effects statement in one message and obtain explicit approval.
9. After approval, write exactly the previewed file inside the supplied `$GTM_HOME`, creating only its `personas/` directory if needed, then commit only that file in the context repo without amending or pushing; report genuine blockers cleanly.
10. Summarize project, canonical org path, qualified label, altitude decision, sources, changed file, commit or skip status, preserved open questions, and downstream recommendation.

## Details

- Derive the canonical org path independently of the filesystem path: root is empty; a child is only nested org ids joined by `/`, excluding the project id and every literal `suborgs/`. Persona labels never include an ICP label.
- After any altitude confirmation and before any draft or preview, emit the exact user-facing line `Working in <project>/<org-path> as <person>`; for root, `<org-path>` is empty.
- Under `ICP Relevance`, copy each visible qualified ICP label exactly; never shorten, expand, or embed it in the persona label, and mark an unresolved reference as such.
- Carry every relevant inherited open question and constraint forward verbatim unless the user explicitly resolves or rephrases it; preserve thresholds, roles, objects, and conditions rather than summarizing them.
- For a new persona, map every relevant root-to-target org or ICP constraint into the closest persona section, usually `Objections And Disqualifiers`; for a refinement, preserve the existing file and add inherited constraints only when requested so exact edits do not cause unrelated churn. When the user explicitly rephrases an inherited question, use the user's wording exactly without restoring omitted qualifiers.
- Before drafting, emit `Sources read:` with repo-relative paths for every root-to-target `org.md`, the resolved `person.md`, and every visible inherited or local ICP and persona.
- Anchor all writes and every Git command at the resolved context-repository root using that directory or `git -C`; never run task Git commands from the eval run directory or an outer workspace. Make the approval request one user-facing message containing the relative target path, purpose, no-external-side-effects statement, complete exact Markdown, and approval question; internal drafts, diffs, or later transcript reconstructions do not satisfy the gate.
- When ownership differs from the active org, make the altitude explanation name the owning org's visible qualified ICP label alongside the offer and evidence before requesting confirmation.
- In the final user-facing response, explicitly name the project, canonical org path, qualified persona label, source files read, changed file, commit or skip status, altitude decision, preserved open questions, and downstream recommendation.
- In that final report, state a root canonical org path as `root (empty)` separately from the project id; the working-position display `<project>/` is not itself the canonical org path.
