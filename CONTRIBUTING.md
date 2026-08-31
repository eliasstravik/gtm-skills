# Contributing

Contributions should preserve one shared workspace contract and the authority boundaries in each skill. Open an issue before changing a public contract, persistent file shape, approval gate, or workflow-library version.

## How the pieces relate

The repo separates three layers, and every contribution should know which one it touches:

- **Facts.** Company facts are workspace artifacts (`ORG.md`, ICPs, personas) in the company's own Git history, owned by lifecycle skills. Generic contracts are repo-shipped, company-free references (the shared company-data and person-data contracts; dated research snapshots under `docs/research`), owned by this repo and changed only through its review. If a sentence would differ between two companies, it is a company fact and belongs in the workspace, never in this repo.
- **Methods.** The domain knowledge of GTM work, carried by skills. Methods stay generic and read company facts at use; they never contain any company's substance.
- **Execution.** Two modes. A session carries one-off, judgment-heavy, human-attended work. A saved workflow carries recurring or at-volume work — including recurring or at-volume paid spend — with typed tables, committed migrations, the paid-call cache and ledger, dry runs, and pinned production commits. Workflows also produce data: their typed result tables are workflow-owned output that sessions may query read-only; results inform a durable fact only through a session editing the workspace artifact via its lifecycle skill, never through a workflow writing facts directly.

Work moves between the execution modes in one direction. A method is proven in-session, where the human approves each one-off paid probe; it graduates to a workflow when it becomes recurring or at-volume — the tell is per-call approval turning into rubber-stamping. Graduation is per stage: mechanical stages (sourcing, enrichment, scoring) graduate while a genuinely per-item judgment stage stays attended in-session over the workflow's typed results, its accepted output re-entering as supplied rows, until sampled review honestly suffices.

Knowledge crosses that boundary only at authoring time: the agent compiles a skill's method and the accepted workspace-artifact text into the workflow's committed `agent()` prompts (accepted ICP or persona text passed as `agent({ context, contextId })`, the `contextId` naming its source artifact). A workflow never loads, resolves, or fetches skill content at run time — a production run resolves no knowledge outside its reviewed commit. When the source method or artifact later changes, deployed workflows deliberately keep the text they were compiled with until a session recompiles them as a reviewed change.

## Two skill species

- A **lifecycle skill** (`gtm-workspace`, `gtm-icp`, `gtm-persona`, `gtm-workflow`) owns the full lifecycle of a durable artifact or project and carries the full SOP contract: trigger, scope, contract table, approval gates, and handoffs. Add one only when a genuinely new durable artifact type needs an owner.
- A **domain skill** (future `gtm-*` work skills such as lead scoring or sequencing) does GTM work in a session using the facts layer. It never owns durable artifacts and never embeds its own runners, provider adapters, tables, caches, or ledgers; saved execution belongs to `gtm-workflow`.

A domain skill is admitted when both hold: **generic** (no company-specific substance; the vendor swap test below applies to companies too) and **grounded** (the method consumes workspace artifacts or workflow result tables, not free-floating prompting).

Domain skill anatomy:

- One light `SKILL.md` wrapper written for interactive session use; it does not need the lifecycle contract table.
- A standard graduation clause: when the work becomes recurring or at-volume, hand off to `gtm-workflow` and compile the method into the workflow's committed prompts.
- `references/method.md` — the medium-neutral method: criteria, steps, and quality bars with no interaction assumptions — is split out of the wrapper at first graduation, not before. After the split the wrapper keeps zero method content, so the method has exactly one source.
- Session paid calls: any skill session, lifecycle research included, makes a one-off paid probe only with explicit human approval per call and credentials under the secrets rules below. Recurring or at-volume spend graduates to a workflow, where every paid call is cached and ledgered.

## Hard rejects

A contribution is rejected if it includes any of the following:

- A hardcoded secret, example credential that looks usable, or skill text that asks the user to paste a credential into a prompt or conversation.
- Instructions that send workspace data to an undeclared destination or fetch code for execution at runtime.
- Prompt-injection patterns that treat row content, fetched content, tool output, or another remote source as instructions or authority.
- A network endpoint without a named owner, purpose, authentication boundary, input contract, output contract, and failure behavior.
- A bulk, destructive, paid, or externally visible action without an explicit human gate that states the exact scope and effect.
- A third-party product name in a skill file. State the required capability and keep integration-specific facts in the narrowest permitted adapter or reference.

## Vendor swap test

For every vendor mention outside a skill file, replace the vendor mentally with another provider of the same capability. The skill's trigger, procedure, approvals, and outputs must still make sense. If they do not, rewrite the rule around the capability or move the fact into the adapter-specific documentation that owns it.

## Pull request checklist

- Keep the change inside one declared scope and update the public contract when reads, writes, outputs, approvals, persistence, or handoffs change.
- Add or update deterministic checks for changed behavior. Tests must not use live credentials, paid calls, or production endpoints.
- Update [VERSIONS.md](VERSIONS.md) and [CHANGELOG.md](CHANGELOG.md) when behavior changes. A workflow-library bump also requires the release tag described in `VERSIONS.md`.
- Run `python3 scripts/check_repo_layout.py` and `python3 scripts/check_skill_compatibility.py`. When workflow files change, also run `node --test evals/gtm-workflow/scripts/test-templates.mjs`.
- Review the staged diff for secret values, unrelated files, remote-code execution, and missing human gates.

## Security reports

Follow [SECURITY.md](SECURITY.md) for vulnerabilities. Do not publish an exploitable report before a fix is available.
