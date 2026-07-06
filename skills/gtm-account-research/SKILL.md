---
name: gtm-account-research
description: Research target accounts against active GTM org ICP context. Use when the user asks for company research, account briefs, target-account notes, outbound account prep, qualification research, durable account-research promotion, or bulk account research from CSVs, tables, account lists, or research exports.
---

# GTM Account Research

Produce account-level briefs grounded in org context and visible ICPs. Normal
output is ephemeral. This skill owns the per-org `research/` collection only
when the user explicitly promotes a result.

## Core Workflow

1. Resolve and echo context.
   - Default `$GTM_HOME` to `~/.gtm`; read local state from
     `$GTM_HOME/state.json`.
   - Resolve project by prompt, current directory inside a context repo, then
     active state. Resolve org by prompt, state pin, then root.
   - Resolve person only when the output is written as the operator or the user
     requests voice/personalization; use prompt, state pin, sole person, then
     ask.
   - Echo: `Working in <project>/<org-path>` and add `as <person>` when one is
     used.
   - Read the `org.md` chain, visible ICP files, relevant scoring files, and
     any saved research promoted for the target org.

2. Enforce prerequisites.
   - If no visible ICP files exist, stop and route to `gtm-define-icp`.
   - Validate paths and ids before reading; reject path escapes and unsafe ids.

3. Choose one-off or bulk mode.
   - Use one-off mode for a single company, website, or selected account.
   - Use bulk mode for CSV files, markdown tables, pasted tables, or CRM/export
     files the user provides.
   - Normalize account name, website, industry, size, region, summary, signals,
     labels, gaps, source links, and open questions.
   - Ask one focused clarification only when account identity is missing;
     otherwise research with explicit uncertainty.

4. Build evidence.
   - Classify saved or prompt-provided links with
     `gtm-setup`'s link classifier when available.
   - Never fetch or print secret-bearing, tokenized, invite, local-only, or
     private-tunnel URLs. Use safe labels for private sources after
     confirmation.
   - Separate saved context, user-provided data, newly found evidence,
     source labels, conflicts, and open questions.
   - Use available browser/search tools only when current evidence is useful
     and permitted; otherwise label claims as user-provided or unresolved.

5. Compose related skills when useful.
   - Compose `gtm-account-segmentation` unless the input already includes a
     valid qualified `segment_label`.
   - Compose `gtm-account-scoring` when governing criteria exist or a score is
     supplied; otherwise explain why scoring was skipped.
   - If research suggests a new ICP or org split, keep it as a promotion
     candidate and route durable changes to `gtm-define-icp` or `gtm-setup`.

6. Write the brief.
   - Interpret the account through visible ICPs: fit, likely pain, timing
     signals, disqualifiers, likely buying committee, personalization angles,
     recommended next step, provenance, confidence, reasoning, review flag, and
     open questions.
   - Do not present prompt claims as independently verified unless you inspected
     the source in this run.
   - Set `needs_review` for low confidence, conflicts, private-source
     dependency, possible disqualifiers, or important recommendations backed by
     weak evidence.

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
   - For one-off mode, return account name, website, segment, optional score,
     priority, brief, ICP relevance, key signals, pain hypotheses, likely
     buying committee, risks, personalization angles, recommended next step,
     confidence, review flag, evidence, and open questions.
   - For bulk mode, start with priority distribution, segment distribution,
     low-confidence count, review-needed count, top signals, risks, and open
     questions; then return compact per-record fields.

## Blocking Rules

- If no context resolves, stop with: `I could not resolve a GTM context repo
  from this prompt, current directory, or local state. Run gtm-setup or tell me
  which GTM project to use.`
- If no visible ICP files exist, stop with: `I found the GTM context repo and
  org, but this scope has no usable ICP files. Run gtm-define-icp first, then
  rerun gtm-account-research.`
- Malformed CSV/table input blocks bulk research until corrected.
- Source conflicts lower confidence unless they affect a critical durable fact;
  then ask before promoting anything.
