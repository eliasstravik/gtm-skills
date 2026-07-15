---
name: gtm-account-research
description: Research target accounts against active GTM org ICP context. Use when the user asks for company research, account briefs, target-account notes, outbound account prep, qualification research, durable account-research promotion, or bulk account research from CSVs, tables, account lists, or research exports.
---

# GTM Account Research

## Recipe

1. Resolve and echo `Working in <project>/<org-path>` plus `as <person>` only when operator voice, personalization, or durable promotion needs it.
2. Read the org chain, visible ICPs, relevant scoring files, and any saved research promoted for the target org.
3. Reject unresolved context, missing visible ICPs, unsafe paths, malformed bulk input, and unsafe source links before research or promotion.
4. Normalize one account or a bulk list, separate saved context, user-provided data, newly inspected evidence, conflicts, and open questions.
5. Compose account segmentation unless a valid qualified segment is supplied; compose scoring when criteria exist or a score is supplied, otherwise explain the skip.
6. Produce the brief without writes, or preview and confirm a per-org `research/` promotion before creating any file.
7. Return metadata, required one-off or bulk fields, provenance, skipped skills, confidence, review flag, open questions, and side-effect status.

## Details

- Default `$GTM_HOME` to `~/.gtm`; read state only from `$GTM_HOME/state.json`.
- Resolve project by prompt, current context repo, then active state; resolve org by prompt, state pin, then root; resolve person from prompt, state pin, sole person, then ask.
- If no context resolves, stop with: `I could not resolve a GTM context repo from this prompt, current directory, or local state. Run gtm-setup or tell me which GTM project to use.`
- If no visible ICP files exist, stop with: `I found the GTM context repo and org, but this scope has no usable ICP files. Run gtm-define-icp first, then rerun gtm-account-research.`
- Validate all ids and paths before reading; reject absolute paths, `..`, separators in ids, non-kebab ids, and symlink escapes.
- Use one-off mode for a single company, website, or selected account; use bulk mode for CSV files, markdown tables, pasted tables, CRM/export files, or account lists.
- Normalize account name, website, industry, size, region, summary, signals, labels, gaps, source links, and open questions.
- Ask one focused clarification only when account identity is missing; otherwise research with explicit uncertainty.
- Classify saved or prompt-provided links with `gtm-setup`'s classifier when available.
- Never fetch or print secret-bearing, tokenized, invite, local-only, or private-tunnel URLs; use safe labels for private sources after confirmation.
- Use browser/search tools only when useful and permitted; otherwise label claims as user-provided or unresolved.
- Do not present prompt claims as independently verified unless you inspected the source in this run.
- Interpret the account through visible ICPs: fit, likely pain, timing signals, disqualifiers, buying committee, personalization angles, recommended next step, provenance, confidence, reasoning, review flag, and open questions.
- Set `needs_review` for low confidence, conflicts, private-source dependency, possible disqualifiers, or important recommendations backed by weak evidence.
- If research suggests a new ICP or org split, keep it as a promotion candidate and route durable changes to `gtm-define-icp` or `gtm-setup`.
- Normal account research states that no CRM, outreach, export, sync, remote push, file write, or external side effect occurred; promotion defaults to the active org and writes under per-org `research/` only after explicit preview and confirmation.
- Source conflicts lower confidence; conflicts affecting a critical durable fact block promotion until clarified.
- Create `research/` only on confirmed promotion; preserve provenance and unresolved questions in the promoted file.
- Metadata includes project, org path, source files read, prerequisites, composed skills, skipped skills, and side-effect status.
- One-off output includes account name, website, segment, optional score, priority, brief, ICP relevance, key signals, pain hypotheses, likely buying committee, risks, personalization angles, recommended next step, confidence, review flag, evidence, and open questions.
- Bulk output starts with priority distribution, segment distribution, low-confidence count, review-needed count, top signals, risks, open questions, then compact per-record fields.
