---
name: gtm-lead-research
description: Research target leads and contacts against active GTM org persona context. Use when the user asks for contact research, person-level briefs, outbound lead prep, buying-committee notes, personalization angles, durable lead-research promotion, or bulk lead research from CSVs, tables, contact lists, or research exports.
---

# GTM Lead Research

Produce person-level briefs grounded in org context and visible personas. Normal
output is ephemeral. This skill owns the per-org `research/` collection only
when the user explicitly promotes a result.

## Core Workflow

1. Resolve and echo context.
   - Default `$GTM_HOME` to `~/.gtm`; read local state from
     `$GTM_HOME/state.json`.
   - Resolve project by prompt, current directory inside a context repo, then
     active state. Resolve org by prompt, state pin, then root.
   - Resolve person when the output is outbound-facing, voice-sensitive, or
     otherwise written as the operator; use prompt, state pin, sole person,
     then ask.
   - Echo: `Working in <project>/<org-path>` and add `as <person>` when one is
     used.
   - Read the `org.md` chain, visible persona files, optional visible ICP
     files, relevant scoring files, and any saved research promoted for the
     target org.

2. Enforce prerequisites.
   - If no visible persona files exist, stop and route to
     `gtm-define-personas`.
   - Validate paths and ids before reading; reject path escapes and unsafe ids.

3. Choose one-off or bulk mode.
   - Use one-off mode for a single person, profile URL, or selected lead.
   - Use bulk mode for CSV files, markdown tables, pasted tables, or CRM/export
     files the user provides.
   - Normalize lead id, account id/name, lead name, title, function, seniority,
     region, persona signal, account segment, score, source links, known gaps,
     evidence labels, and open questions.
   - Ask one focused clarification only when identity or core role evidence is
     missing; otherwise research with explicit uncertainty.

4. Build evidence.
   - Classify saved or prompt-provided links with
     `gtm-setup`'s link classifier when available.
   - Never fetch or print secret-bearing, tokenized, invite, local-only, or
     private-tunnel URLs. Use safe labels for private sources after
     confirmation.
   - Separate saved context, user-provided data, newly found evidence,
     source labels, conflicts, and open questions.
   - Do not imply private intent, pain, budget, authority, or willingness to buy
     unless explicitly evidenced. Treat those as hypotheses or open questions.

5. Compose related skills when useful.
   - Compose `gtm-lead-segmentation` unless the input already includes a valid
     qualified `persona_label`.
   - Compose `gtm-lead-scoring` when governing criteria exist or a score is
     supplied; otherwise explain why scoring was skipped.
   - Compose `gtm-account-research` when account identity materially changes
     prioritization, pain hypotheses, or personalization.
   - If research suggests a new persona or org split, keep it as a promotion
     candidate and route durable changes to `gtm-define-personas` or
     `gtm-setup`.

6. Write the brief.
   - Interpret the lead through visible personas: role and responsibilities,
     likely priorities, buying influence, pain proximity, account context,
     outreach-safe personalization, risks/disqualifiers, recommended next step,
     provenance, confidence, reasoning, review flag, and open questions.
   - Do not present prompt claims as independently verified unless you inspected
     the source in this run.
   - Set research priority from persona fit, score when present, account fit,
     evidence strength, and review state.
   - Set `needs_review` for low confidence, conflicts, private-source
     dependency, unclear buying authority, interim/consulting status, possible
     disqualifiers, or important recommendations backed by weak evidence.

7. Promote only on explicit request.
   - Normal output writes nothing.
   - If the user asks to save/promote the result, preview the target org path
     and file under `research/`; default to active org unless another org is
     named.
   - Create `research/` only on confirmed promotion. Preserve provenance and
     unresolved questions in the promoted file.

8. Return the result.
   - Include project, org path, source files read, prerequisites, composed
     skills, skipped skills, and side-effect status.
   - For one-off mode, return lead name, account, title, persona, optional
     score, research priority, brief, role relevance, likely priorities,
     account context, risks, personalization angles, recommended next step,
     confidence, review flag, evidence, and open questions.
   - For bulk mode, start with priority distribution, persona distribution, fit
     distribution when scoring is present, low-confidence count, review-needed
     count, top signals, risks, and open questions; then return compact
     per-record fields.

## Blocking Rules

- If no context resolves, stop with: `I could not resolve a GTM context repo
  from this prompt, current directory, or local state. Run gtm-setup or tell me
  which GTM project to use.`
- If no visible persona files exist, stop with: `I found the GTM context repo
  and org, but this scope has no usable persona files. Run gtm-define-personas
  first, then rerun gtm-lead-research.`
- Malformed CSV/table input blocks bulk research until corrected.
- Source conflicts lower confidence unless they affect a critical durable fact;
  then ask before promoting anything.
