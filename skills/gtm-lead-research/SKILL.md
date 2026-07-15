---
name: gtm-lead-research
description: Research target leads and contacts against active GTM org persona context. Use when the user asks for contact research, person-level briefs, outbound lead prep, buying-committee notes, personalization angles, durable lead-research promotion, or bulk lead research from CSVs, tables, contact lists, or research exports.
---

# GTM Lead Research

## Recipe

1. Resolve and echo `Working in <project>/<org-path>` plus `as <person>` when outbound voice, personalization, or durable promotion needs it.
2. Read the org chain, visible personas, optional visible ICPs, relevant scoring files, and any saved research promoted for the target org.
3. Reject unresolved context, missing visible personas, unsafe paths, malformed bulk input, and unsafe source links before research or promotion.
4. Normalize one lead or a bulk list, separate saved context, user-provided data, newly inspected evidence, conflicts, and open questions.
5. Compose lead segmentation unless a valid qualified persona is supplied; compose lead scoring when criteria exist or a score is supplied, otherwise explain the skip; compose account research when account identity materially changes prioritization.
6. Produce the brief without writes, or preview and confirm a per-org `research/` promotion before creating any file.
7. Return metadata, required one-off or bulk fields, provenance, skipped skills, confidence, review flag, open questions, and side-effect status.

## Details

- Default `$GTM_HOME` to `~/.gtm`; read state only from `$GTM_HOME/state.json`.
- Resolve project by prompt, current context repo, then active state; resolve org by prompt, state pin, then root; resolve person from prompt, state pin, sole person, then ask.
- If no context resolves, stop with: `I could not resolve a GTM context repo from this prompt, current directory, or local state. Run gtm-setup or tell me which GTM project to use.`
- If no visible persona files exist, stop with: `I found the GTM context repo and org, but this scope has no usable persona files. Run gtm-define-personas first, then rerun gtm-lead-research.`
- Validate all ids and paths before reading; reject absolute paths, `..`, separators in ids, non-kebab ids, and symlink escapes.
- Use one-off mode for a single person, profile URL, or selected lead; use bulk mode for CSV files, markdown tables, pasted tables, CRM/export files, contact lists, or research exports.
- Normalize lead id, account id/name, lead name, title, function, seniority, region, persona signal, account segment, score, source links, gaps, evidence labels, and open questions.
- Ask one focused clarification only when identity or core role evidence is missing; otherwise research with explicit uncertainty.
- Classify saved or prompt-provided links with `gtm-setup`'s classifier when available.
- Never fetch or print secret-bearing, tokenized, invite, local-only, or private-tunnel URLs; use safe labels for private sources after confirmation.
- Use browser/search tools only when useful and permitted; otherwise label claims as user-provided or unresolved.
- Do not present prompt claims as independently verified unless you inspected the source in this run.
- Do not imply private intent, pain, budget, authority, or willingness to buy unless explicitly evidenced; treat them as hypotheses or open questions.
- Interpret the lead through visible personas: role, responsibilities, likely priorities, buying influence, pain proximity, account context, outreach-safe personalization, risks/disqualifiers, recommended next step, provenance, confidence, reasoning, review flag, and open questions.
- Set research priority from persona fit, score when present, account fit, evidence strength, and review state.
- Set `needs_review` for low confidence, conflicts, private-source dependency, unclear buying authority, interim/consulting status, possible disqualifiers, or important recommendations backed by weak evidence.
- If research suggests a new persona or org split, keep it as a promotion candidate and route durable changes to `gtm-define-personas` or `gtm-setup`.
- Normal lead research states that no CRM, outreach, export, sync, remote push, file write, or external side effect occurred; promotion defaults to the active org and writes under per-org `research/` only after explicit preview and confirmation.
- Source conflicts lower confidence; conflicts affecting a critical durable fact block promotion until clarified.
- Create `research/` only on confirmed promotion; preserve provenance and unresolved questions in the promoted file.
- Metadata includes project, org path, source files read, prerequisites, composed skills, skipped skills, and side-effect status.
- One-off output includes lead name, account, title, persona, optional score, research priority, brief, role relevance, likely priorities, account context, risks, personalization angles, recommended next step, confidence, review flag, evidence, and open questions.
- Bulk output starts with priority distribution, persona distribution, fit distribution when scoring is present, low-confidence count, review-needed count, top signals, risks, open questions, then compact per-record fields.
