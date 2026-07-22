---
name: gtm-define-icp
description: Triggers when a user asks to create, define, or refine an ideal customer profile in a GTM context repository.
---

# Define an ICP

## Recipe

1. Resolve the supplied `$GTM_HOME/state.json` to the active project, canonical org path, and person; never access or modify `~/.gtm` or `state.json`.
2. Read and report the project-root `org.md`, every `org.md` from root through the target org, the resolved `person.md` when present, and all ICPs visible there through inheritance.
3. Infer the ICP's owning altitude from the evidence; if it differs from the active org or remains ambiguous, explain why and confirm the canonical org path and lowercase kebab-case ICP id before drafting.
4. Echo `Working in <project>/<canonical-org-path> as <person>` after the altitude is settled.
5. Draft one `<target-org>/icps/<icp-id>.md` with one H1 and these H2s in order: `Identity`, `Account Profile`, `Fit Signals`, `Buying Context`, `Disqualifiers`, `Evidence And Confidence`, `Review Needs`, `Open Questions`.
6. Record `Qualified label` and `Status` under `Identity`; label root ICPs `<icp-id>` and child ICPs `<canonical-org-path>/<icp-id>`, using `draft` for new or materially unresolved ICPs and retaining an existing `working definition` absent an explicit evidence-backed lifecycle decision.
7. Preserve sourced facts, constraints, evidence strength, review needs, and open questions without invention or loss of specificity; make missing facts open questions and retain existing human-authored sections after the core exactly unless explicitly asked to edit them.
8. Before writing, show the target path, purpose, and complete exact Markdown inline, state that no external side effects are planned, and obtain explicit approval.
9. After approval, write exactly the previewed file inside the supplied `$GTM_HOME`, creating only its `icps/` directory if needed, then commit only that file in the context repo without amending or pushing; report cleanly if committing is unavailable or unapproved.
10. Summarize the project, canonical org path, qualified label, altitude decision, sources read, file changed, commit or skip status, preserved open questions, and natural downstream recommendation.

## Details

- Derive the canonical org path independently of the filesystem path: root is empty; a child is only its nested org ids joined by `/`, excluding the project id and every literal `suborgs/`. Therefore a child qualified label is `<org-path>/<icp-id>`.
- After any altitude confirmation and before any draft or preview, emit the exact user-facing line `Working in <project>/<org-path> as <person>`; for root, `<org-path>` is empty.
- Carry every relevant inherited open question and constraint forward verbatim unless the user explicitly resolves or rephrases it; preserve all thresholds, objects, and conditions rather than summarizing them.
- Before drafting, emit `Sources read:` with repo-relative paths for every root-to-target `org.md`, the resolved `person.md` when present, and every visible inherited or local ICP.
- Make the approval request one user-facing message containing the relative target path, purpose, no-external-side-effects statement, complete exact Markdown, and approval question; internal drafts, diffs, field summaries, or later transcript reconstructions do not satisfy this gate.
- In the final user-facing response, explicitly name the project, canonical org path, qualified label, source files read, changed file, commit or skip status, altitude decision, preserved open questions, and downstream recommendation.
