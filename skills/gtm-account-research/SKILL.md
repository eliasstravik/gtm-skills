---
name: gtm-account-research
description: "Research target accounts from supplied source packets or an active GTM context: produce or refresh evidence-backed briefs, dossiers, investigations, buying-signal analysis, and fact/conflict/hypothesis/question breakdowns; also durably promote an approved account-research brief into its owning GTM organization. Not for segmentation or scoring, person or lead research, ICP/persona definition, GTM setup, generic company history, CRM writes, or governance/template design."
---

# Research Accounts

## Recipe

1. Resolve the supplied `$GTM_HOME/state.json` to project, canonical org path, and person; never access or modify `~/.gtm`.
2. Read and report the root-to-target `org.md` chain, every visible ICP, relevant saved research, and each allowed source packet.
3. Normalize account identity and supplied segment; accept only `no-match` or an exact visible qualified ICP label, without re-segmenting or inventing facts.
4. Reject or safely label private, tokenized, local-only, or otherwise unsafe sources; inspect only allowed sources, and obey any no-browse constraint.
5. Separate inspected findings, user-provided unverified claims, hypotheses, conflicts, and open questions; preserve source publisher, date, and provenance.
6. Interpret the evidence against visible ICP criteria: fit, timing, risks/disqualifiers, pain and committee hypotheses, personalization angles, priority, confidence, review flag, and recommended next step.
7. For bulk work, return every account once and start with priority/segment distributions, confidence/review counts, top inspected signals, common risks, and common questions.
8. Keep normal research response-only; finish with project/org/mode/sources/prerequisites/supplied-segment/skipped-activity/no-side-effects metadata.
9. For durable promotion, infer the owning org, draft one `<target-org>/research/<account-id>.md` with one H1 and H2s in this order: `Identity`, `Research Scope`, `Executive Brief`, `Inspected Findings`, `Unverified Claims`, `ICP Relevance`, `Timing Signals`, `Pain Hypotheses`, `Buying Committee Hypotheses`, `Risks And Disqualifiers`, `Personalization Angles`, `Recommended Next Step`, `Evidence`, `Conflicts`, `Review Needs`, `Open Questions`.
10. Before promotion, show relative target, purpose, complete exact Markdown, and no-external-side-effects statement in one message and obtain explicit approval; then write exactly that file and commit only it without amend or push.

## Details

- Canonical org paths exclude the project id and literal `suborgs/`: root is empty and child `emea` is canonical `emea`. Physical paths are different: root research is `research/<account-id>.md`; canonical child `emea` maps to `suborgs/emea/research/<account-id>.md`. Resolve the context-repository root from state and perform every file and Git operation inside it.
- Before any research conclusion or promotion preview, emit `Sources read:` with the root-to-target `org.md` paths, every visible ICP path, relevant saved-research paths or `none`, and allowed source packets; then emit exactly `Working in <project>/<canonical-org-path> as <person-id>`, using `Working in <project>/ as <person-id>` at root.
- Priority measures strength and immediacy of an evidence-backed research case. Use high only for a material current pain or deadline supported by enough inspected evidence; a future launch/fit signal from one packet without demonstrated pain is medium; no inspectable evidence is `research-needed`, not a numbered or low-priority band.
- `needs_review` is true for a material evidence conflict, unsafe-source dependency, or gap that blocks a reliable recommendation. Keep ancillary unverified notes in claims and open questions without automatically setting review; confidence may be medium while review remains false.
- In bulk, every compact account row explicitly labels: account, website, supplied segment, inspected evidence, unverified claims, hypotheses, conflicts, ICP relevance, timing, risks/disqualifiers, personalization angles, priority, confidence, `needs_review`, recommendation, provenance, and open questions. Write `None identified` or `None supported` rather than omitting an empty field.
- Give every account an explicit `Personalization angles` field distinct from its recommended next step, including compact bulk rows; ground each angle in inspected evidence and use `None supported` when evidence is insufficient.
- For approval, show one complete message with the repository-relative physical target, purpose, no-external-side-effects statement, exact full Markdown, and one approval question. Consume the next scripted reply as the answer after asking; do not ask again, alter the preview, or announce a different path.
- After approval, create the parent directory under the resolved context-repository root, write the preview byte-for-byte, stage that repository-relative file alone, verify the staged diff contains only it, and create one non-amending local commit. Never claim success if the exact file or commit is absent; final output names the physical file and commit.
- Every final response, including a completed promotion, ends with project, canonical org path, mode, inspected source files, prerequisite/approval status, exact supplied-segment status, skipped activity, and actual side effects; do not let the changed-file/commit summary replace this metadata.
- Persist the complete user-visible exchange under `transcript.md`, including source report, working line, full preview, approval reply, and final response under `## FINAL MESSAGE`; the transcript is run evidence, not a GTM context artifact.
