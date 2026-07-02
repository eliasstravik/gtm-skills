# Project Brief: GTM Skills

## Goal

Build a standards-compatible library of AI agent skills for the full go-to-market motion: sales, marketing, revenue operations, customer success, partnerships, and growth.

## Intended users

- **Full vision:** GTM teams across sales, marketing, revenue operations, customer success, partnerships, and growth.
- **MVP wedge:** SDRs and BDRs first, then adjacent sales individual contributors such as AEs and full-cycle sellers.
- Founders doing founder-led sales and marketing
- GTM operators building repeatable systems
- Agents that need structured operating knowledge for commercial workflows

## Product shape

The repository should become a curated, skills.sh-compatible skill library where each skill teaches an agent how to execute a specific GTM workflow. Skills should be installable, composable, and written with enough context for an agent to perform useful work without repeatedly asking for generic instructions. The MVP should target portable Agent Skills first; helper scripts are allowed when they materially improve reliability, but a custom global CLI is not the primary user interface.

## MVP skill quality bar

An MVP skill is shippable only when it follows `/skill-creator` and `/writing-great-skills` best practices: valid package shape, invocation-quality description, lean `SKILL.md`, checkable steps, progressive disclosure, used bundled resources, realistic examples, verification, and GTM-specific output contracts where relevant.

## Initial workstreams

The first implementation slice is foundation-first: build the smallest setup, context-resolution, scaffold, template, and validation layer that every MVP skill depends on before implementing downstream GTM workflow skills.

1. Implement `gtm-setup`, `~/.gtm/registry.json` handling, context repo scaffold generation, workspace/person/context resolution rules, skill metadata validation, and core templates.
2. Define the skill authoring standard and folder conventions.
3. Map the first GTM skill taxonomy, including function tags and role tags.
4. Create shared context patterns for product, customer, market, offer, and CRM state under `~/.gtm` context projects.
5. Build the first batch of high-leverage GTM workflow skills on top of the foundation.
6. Add verification checklists and example outputs.
7. Prepare packaging, documentation, and eventual public launch materials.

## Taxonomy notes

- Skills should be classifiable by **function**: sales, marketing, revenue operations, customer success, partnerships, growth, and related GTM functions.
- Skills should also be classifiable by **role**: SDR, BDR, AE, sales ops, marketing ops, CRO, VP Sales, customer success manager, partnerships lead, and other common GTM roles.
- Skills can have multiple function and role tags because many workflows cross functional boundaries.
- Over time, onboarding should capture both the user's role and company type so the agent can recommend, compose, and tailor the most relevant skills.

## Context model notes

- GTM context should live under the user-controlled `~/.gtm` root, not under `.agents/`.
- The `~/.gtm` root should include a richer home-level registry/settings file rather than only a `.current` pointer, so skills can see active project, project list, aliases, created timestamps, last-used timestamps, and updated timestamps.
- Organization IDs should be auto-generated from the organization display name, disambiguated on registry collision, slugified as lowercase kebab-case, shown with the repo path, and overridable before writing.
- `~/.gtm` should support multiple businesses or client projects, for example `~/.gtm/google/` and `~/.gtm/apple/`.
- Each project folder should be initialized as a git repository by default for one organization/company/client so a solo user can keep it local, or a team can push it to GitHub and share context. Setup should create an initial commit by default after successful scaffolding, should not create remotes by default, and users can opt out of git.
- A project can contain multiple business units, teams, people, and GTM workspaces. This lets one organization support motions like Google Cloud SMB SDR, Google Cloud enterprise AE, and Android partnerships without duplicating company-level context.
- `gtm-setup` should scaffold `business-units/` and `teams/` directories, but should not create Business Unit or Team files unless the user needs them to represent the actual context chain.
- Optional Business Unit and Team files should use standard scope-oriented templates. They explain organizational scope and should not duplicate workspace-specific ICPs, personas, scoring, or local active user state.
- `gtm-setup` should ask one setup-depth question so users can choose simple/default workspace, business unit, business unit + team, or team only.
- `gtm-setup` should explicitly distinguish required setup questions from optional enrichment questions. Missing required setup answers block setup; missing or unresolved enrichment answers do not.
- `gtm-setup` should optionally ask for organization, product, proof, docs, company-social, and active-person profile/source links. The agent should use those sources to draft initial context, show proposed durable context to the user, and write enriched context only after confirmation; users can skip this and keep sparse templates.
- Enrichment confirmation should use a concise section-by-section preview grouped by target file, with options to apply all, edit before applying, apply selected sections, keep sparse templates, or add more links/context and retry.
- If source-assisted enrichment finds conflicting or unclear information that matters to durable GTM context, setup should ask the user for clarification before writing that claim as fact. Unresolved claims should be left blank or recorded as open questions, not silently promoted into factual sections.
- Unresolved source-assisted enrichment clarification should not block the whole setup. It blocks only the affected optional claim/field/section; setup continues with confirmed context and reports unresolved questions in the summary.
- If source-assisted enrichment is confirmed during setup, the initial commit should include the confirmed enriched context. If enrichment is skipped or not confirmed, the initial commit should include sparse templates only.
- Confirmed public/user-approved source links should be saved in relevant markdown context files by default, while private/internal links require explicit confirmation and secret-bearing links must never be committed. Long source lists should not live in `gtm.yaml`.
- `gtm-setup` should classify source links before saving them: public-looking links can be saved after normal confirmation, internal/private-looking links require explicit confirmation before committing, and secret-bearing/signed/tokenized/invite/local-only links should be stripped or redacted and not committed.
- If an omitted private/sensitive link was used to support confirmed context, setup should save a human-safe source label by default, unless the user opts out. The label must not include the sensitive URL, tokens, document IDs, invite codes, or sensitive project details.
- The enrichment preview should show proposed safe source labels and omitted/redacted source counts before writing them, so the user can accept, edit, or remove labels that would become durable context.
- Saved source links should be treated by later research, scoring, and segmentation skills as starting evidence and places to look first, not as guaranteed permanent truth. Skills should still evaluate freshness, source quality, contradictions, and confidence.
- Research, scoring, and segmentation outputs should cite source provenance for important claims and decisions, distinguishing workspace context, saved source links, safe source labels, newly found evidence, and unresolved open questions without exposing sensitive URLs or private source details.
- Provenance should use a lightweight standard format: structured entries for important evidence and compact inline provenance for simple evidence, using canonical source types such as `workspace-context`, `saved-source-link`, `safe-source-label`, `newly-found-evidence`, `user-provided-context`, and `open-question`.
- Bulk research, scoring, and segmentation outputs should carry compact per-record provenance by default. MVP bulk input support is CSV/table-file only: CSV files, simple markdown tables, copied tabular data, and CRM/spreadsheet exports provided as files. CSV/table outputs should stay scannable with fields like `top_evidence`, `confidence`, and `open_questions`; richer JSON/YAML/markdown outputs can include structured evidence arrays, expanded for high-priority, low-confidence, disputed, or user-selected records.
- Bulk research, scoring, and segmentation runs should also include a concise run-level summary with record counts, fit/segment distributions, low-confidence and open-question counts, records needing review, top evidence patterns, and common open questions.
- Every research, scoring, and segmentation result should include `confidence` (`low`, `medium`, or `high`), `reasoning` (a short paragraph explaining the result and confidence), and `needs_review` (`true` or `false`).
- Do not include a separate standard `review_reasons` field; when `needs_review` is true, the review trigger should be clear from `reasoning`, `confidence`, `open_questions`, and provenance.
- New unreviewed low-confidence results should start with `needs_review: true`; medium/high confidence can still require review for ambiguity, conflicts, disqualifiers, private-source sensitivity, compliance, or workflow reasons. Human review can clear the gate by setting `needs_review: false` and updating `reasoning`, without adding override metadata.
- `needs_review: true` should block automated downstream actions by default. Downstream skills may queue for review, summarize, group, or draft pending approval, but should not send outreach, update CRM fields, enrich durable context, mark records ready, or trigger campaigns without review.
- `needs_review: false` should mean automation-eligible, not side-effect-authorized. Sending outreach, updating CRM, enriching durable context, marking external records ready, triggering campaigns, or syncing external systems still requires explicit user instruction or a configured automation policy/integration rule.
- Automation policies are out of scope for the MVP. MVP skills may act on explicit user instruction and prepare drafts/proposals/queues/ready lists, but should not define policy files, rule syntax, approval scopes, integration-specific automation semantics, or background side-effect execution rules yet.
- MVP side-effecting actions require a concise preview and confirmation before execution. The preview should state the action, target system/durable destination, affected counts, important exclusions such as review-gated records, and whether outreach, CRM updates, campaign triggers, or durable context writes will happen.
- GTM Skills should optimize for mostly nontechnical users: do safe discovery and safe/obvious steps automatically, avoid asking users to make technical choices, and use plain-language accept/deny previews when material uncertainty remains. Those previews should include the agent's recommended choice by default when a safer or clearly better option is identifiable.
- Side-effect previews should be summary-first by default: show compact totals and important exceptions, not full row dumps for large batches. Show full detail only for small batches, user-requested detail, errors/conflicts, or unusually sensitive actions.
- Durable GTM context writes should use file/section previews by default, not raw full diffs. Show raw diffs only when the user asks, the change is small, there are conflicts, the change is unusually sensitive/destructive, or the summary is not enough to make scope clear.
- Durable GTM context writes should auto-commit when every written change is safe, or when unclear/conflicting/destructive cases have been reviewed and approved by the user. The preview should say whether a git commit will be created and show the proposed commit message; the post-action summary should report commit status/hash or say changes remain uncommitted.
- Auto-commit must include only the files/changes produced by the confirmed GTM context action. Leave unrelated pre-existing working-tree changes uncommitted; skip auto-commit when target files/sections have pre-existing edits that make isolation unclear.
- GTM context auto-commit should never auto-push by default in the MVP. Pushing requires explicit user request, Side-Effect Preview naming remote/branch/commits, safe credentials/remote configuration, and confirmation.
- Auto-commit failures should not roll back successful durable GTM context writes. Keep the written files, report the exact git blocker when available, and state that changes remain uncommitted.
- Confirmed side-effecting actions should produce a concise post-action summary reporting what actually happened: records/files considered, updated, unchanged, skipped, failed, records skipped because `needs_review: true`, whether outreach/CRM/campaign/sync/durable writes/git commits/pushes occurred, and concise failure details or safe follow-up handles where useful.
- Post-action summaries are ephemeral by default for the MVP. Do not write durable logs unless the user explicitly asks to save/export the summary, the summary is part of a confirmed durable side effect, or a future integration defines audit/logging behavior.
- A project should include canonical agent-facing instructions in `AGENTS.md` and a `CLAUDE.md` compatibility shim that imports `AGENTS.md` using Claude Code's documented `@AGENTS.md` syntax.
- `AGENTS.md` should contain generic operating rules and context-resolution instructions only. It should not duplicate generated project state or local active state such as active person, active workspace, or current organization.
- The generated `AGENTS.md` template should cover context resolution, local state, durable vs ephemeral artifacts, workspace rules, skill-owned files, and safety rules.
- Organization-level context should live in `organization.md`. Actual GTM operating context should live under `workspaces/<workspace>/context.md`.
- The generated `organization.md` template should cover what the organization is, website/sources, products/offerings, positioning, proof points, constraints/things to avoid, and notes/open questions. It should stay organization-level and avoid workspace-specific ICPs, personas, scoring, or motion details by default.
- The generated workspace `context.md` template should cover what the workspace is for, offering, market, GTM motion, target outcomes, messaging notes, constraints/disqualifiers, and notes/open questions. It should not contain ICP definitions, personas, or scoring models by default.
- The minimum Organization fields are `id` and `display_name`; website, category, stage, headquarters, and similar firmographic fields are optional at setup.
- `gtm.yaml` is the project-local machine-readable index for shared organization metadata, default workspace, business units, teams, people, and workspaces. Markdown files hold richer human-editable context.
- Generated `gtm.yaml` should omit unknown optional fields rather than writing `null` placeholders. Required fields are always present, known optional fields may be included, and missing optional fields mean unknown/not captured.
- User-specific active state must not be committed to the shared context repo. Active organization/project, active person, and active workspace live in local state, preferably `~/.gtm/registry.json`.
- `gtm.yaml` collections should be maps keyed by stable IDs, not lists. Display names do not need to be unique; people with the same name are disambiguated by email, username, employee identifier, or a suffix in the stable ID.
- Person IDs should be auto-generated from display name, disambiguated when needed, slugified as lowercase kebab-case, shown to the user, and overridable before writing.
- Every usable context project must identify at least one active person and one full context chain. The simple chain is Organization → Person → GTM Workspace; larger organizations can extend it to Organization → Business Unit → Team → Person → GTM Workspace.
- The minimum operational Person fields are `display_name`, free-text `role`, `default_workspace`, and `path`. `role` should not use a controlled enum; agents can interpret company-specific titles semantically. Extra fields such as email, team, business unit, focus, territory, and goals are optional unless needed to disambiguate the chain.
- The generated `people/<person-id>.md` template should include role, default workspace, links/sources, focus, responsibilities, goals, working preferences, and notes/open questions. This is shared durable Person context, not local active-person state.
- The minimum Workspace fields are `display_name` and `path`. Offering, market, GTM motion, business unit, and team are optional structured fields at setup and can be described in `workspaces/<workspace>/context.md` first.
- Workspace IDs should be auto-generated from the most specific available setup context, slugified as lowercase kebab-case, shown to the user, and overridable before writing.
- The context repo should contain durable context only: organization facts, business-unit/team/person context, product/offer context, proof points, disqualifiers, messaging, ICPs, personas, scoring models, and how agents should use that context.
- Per-session outputs such as account research briefs, lead research notes, outreach drafts, and campaign artifacts are ephemeral by default and should not be stored in the shared context repo unless the user explicitly promotes them into durable context.
- `gtm-setup` should scaffold `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `gtm.yaml`, `organization.md`, `business-units/`, `teams/`, `people/<person-id>.md` for the setup Person, and `workspaces/default/context.md`. Skill-specific files such as `icps.md`, `personas.md`, and `scoring.md` should be created under the relevant workspace only when their owning skills are invoked.
- `gtm-setup` should build an in-memory setup model first, then write files in deterministic order: resolve IDs/paths, ensure registry, create repo, initialize git, write scaffold files, update local active state, then create the initial commit last.
- `gtm-setup` should be idempotent and non-destructive by default: preserve existing files and unknown fields, add missing scaffold pieces only, update local active state for valid existing repos, and use repair mode for partial scaffolds.
- `gtm-setup` should always end with a concise setup summary showing organization ID/path, active person/workspace, files created/preserved/repaired, git initialization/commit status, and next recommended skills.
- The scaffolded `.gitignore` should protect local GTM state, personal Claude instructions, secrets, ephemeral outputs, temporary files, logs, and OS/editor noise from accidental commits. Idempotent setup/repair should merge missing ignore rules without deleting user rules.
- Segmentation produces a categorical label based on ICPs or personas, with `no-match` as the canonical label when none apply. Scoring produces a 1-100 fit score with qualitative bands: `not-a-fit`, `good-fit`, `great-fit`, and `excellent-fit`.
- Account segmentation depends on defined ICPs; lead segmentation depends on defined personas. Account scoring depends on account segmentation; lead scoring depends on lead segmentation. `no-match` always scores as `not-a-fit` and cannot exceed 49.
- Account research depends on defined ICPs, and lead research depends on defined personas. If the relevant definitions are missing, research skills should stop and guide the user to create them first.
- Skills should distinguish hard context prerequisites from composable skill dependencies. Hard prerequisites block execution when missing; composable dependencies can be run internally to improve the result without forcing the user to invoke every skill manually.
- Every MVP skill should encode taxonomy and dependency information in `metadata`: `function_tags`, `role_tags`, `requires_context`, `composes`, `output_mode`, and `supports`.

## Canonical demo fixture

Use the fictional **Northstar Compliance** scenario for MVP examples and verification: an AI-assisted compliance operations workspace sold by SDR Jordan Lee into the `Fintech compliance outbound` workspace. The fixture should include ICP segments for compliance-heavy fintechs, regulated B2B SaaS companies, and marketplaces with onboarding/KYC/risk friction; personas such as Head of Compliance, VP Operations, and Risk / Trust & Safety lead; and 6-10 fictional account/lead rows with mixed fit, no-match, and low-confidence cases.

## First skill areas to consider

- Product and GTM context setup / scaffolding
- ICP definition as account-segment definition
- Persona definition as people-within-ICP definition
- Account research and account scoring
- Lead research and lead scoring
- Account segmentation and lead segmentation
- Cold email and outbound sequences
- Sales discovery preparation
- CRM hygiene and pipeline inspection
- Churn risk analysis and retention plays
- Expansion and upsell opportunity mapping
- Partner prospecting and co-marketing planning
- Launch planning and competitive positioning

## Non-goals for the first pass

- Building a SaaS application
- Creating broad prompt collections without workflows
- Publishing claims without source requirements
- Optimizing for every possible agent runtime before the core skill quality bar is proven
