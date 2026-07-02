# GTM Skills Ubiquitous Language

## GTM Team
The full target audience for the project: sales, marketing, revenue operations, customer success, partnerships, growth, and related commercial teams.

## Sales Individual Contributor
The MVP's first user: a quota-carrying or pipeline-generating sales practitioner such as an SDR, BDR, AE, or full-cycle seller.

## SDR / BDR
The MVP's narrower first user: a sales development or business development representative whose daily work is prospecting, account research, lead research, qualification, and outbound outreach.

## Ideal Customer Profile
The definition of which account segments are a best fit for the product. It captures firmographic, technographic, situational, and trigger-based account criteria.

## Persona
The definition of the ideal people inside an Ideal Customer Profile account. Personas capture role, seniority, department, pains, priorities, buying influence, objections, and language.

## Account Research
Company-level research about a target account: what the company does, why it may fit the Ideal Customer Profile, relevant triggers, strategic priorities, likely pain, and account-level talking points.

## Lead Research
Person-level research about an individual lead or contact inside a target account: role, responsibilities, likely priorities, public signals, relevance to the buying committee, and personalization angles.

## Research Dependency
Account research depends on defined ICPs, and lead research depends on defined personas. If the required definitions do not exist, the research skill should stop and guide the user to define them first because otherwise it cannot know what information is interesting.

## Account Scoring
A structured evaluation of how well a company matches the Ideal Customer Profile and how timely it is to pursue, usually combining fit, intent, trigger, and disqualification criteria.

## Lead Scoring
A structured evaluation of how relevant a person is for outreach or sales engagement inside a target account, usually combining persona fit, seniority, buying influence, likely pain, and available personalization signals.

## Account Segmentation
A structured classification of an account into one of the defined Ideal Customer Profile segments, or an explicit non-fit / neither bucket when it does not match any ICP.

## Lead Segmentation
A structured classification of a person into one of the defined personas, or an explicit non-fit / neither bucket when they do not match any persona.

## Segmentation Dependency
Account segmentation depends on defined ICPs, and lead segmentation depends on defined personas. If the required definitions do not exist, the segmentation skill should stop and guide the user to define them first.

## Scoring Dependency
Account scoring depends on account segmentation, and lead scoring depends on lead segmentation. If segmentation returns `no-match`, the scoring result must be `not-a-fit` and cannot score above 49.

## Hard Context Prerequisite
Durable context that must exist before a skill can do meaningful work. Missing Hard Context Prerequisites should block execution and route the user to the setup or definition skill that creates them.

## Composable Skill Dependency
A sibling skill or workflow that can be used inside another skill to improve the result without requiring the user to invoke it separately. Missing or skipped Composable Skill Dependencies should not block execution unless their required context is also a Hard Context Prerequisite.

## Dependency Trace
A short output section that states which prerequisites and composed skills were used, skipped, or blocked, and why.

## Portable Agent Skill
The MVP package target for each GTM Skill: a skills.sh-compatible Agent Skill whose `SKILL.md` remains useful on its own to an agent without requiring a custom global CLI as the primary user interface.

## MVP Skill Definition of Done
The quality gate for shipping an MVP GTM Skill: valid package shape, invocation-quality description, lean `SKILL.md`, checkable completion criteria, explicit context prerequisites, output contract, pitfalls/safety rules, verification checklist, progressive disclosure for long references/examples, used bundled resources only, realistic example input/output, tested helper scripts when present, and GTM-specific provenance/confidence/review fields where relevant.

## Helper Script
An optional deterministic script under `scripts/` or project tooling that supports a skill by reducing ambiguity, risk, or repetitive boilerplate. MVP helper scripts are appropriate for metadata validation, scaffold-shape validation, template generation, and CSV/bulk input parsing, but they should not replace clear skill-body instructions.

## Skill Metadata Contract
The standard frontmatter metadata fields GTM Skills use to expose taxonomy, dependencies, output persistence, and one-off/bulk support in a machine-readable way.

## No Match Segment
The standard segmentation label for an account or lead that does not match any defined ICP segment or persona. Use `no-match` as the canonical machine-readable label.

## Fit Score
A 1-100 score used by account scoring and lead scoring to rank fit and priority. Scores include a corresponding fit label.

## Fit Label
The qualitative label attached to a Fit Score: `not-a-fit`, `good-fit`, `great-fit`, or `excellent-fit`.

## One-off GTM Task
A task that processes a single account, lead, or record. MVP research, scoring, and segmentation skills must support one-off use.

## Bulk GTM Task
A task that processes many accounts, leads, or records from CSV/table-file inputs: CSV files, simple markdown tables, copied tabular data, or CRM/spreadsheet exports provided as files. MVP research, scoring, and segmentation skills must support bulk use with file/table inputs and should use subagents or other batching patterns when appropriate. Native CRM, spreadsheet, Airtable, enrichment-provider, or similar integrations are out of scope for MVP bulk mode.

## CSV/Table Bulk Mode
The MVP minimum for bulk-capable GTM Skills: process CSV files, simple markdown tables, copied/exported tabular data, and CRM/spreadsheet/system exports provided as files, while deferring native external-system integrations until after the portable skill workflows are proven.

## Canonical Demo Fixture
The shared fictional MVP scenario for examples and verification: Northstar Compliance, an AI-assisted compliance operations workspace sold by SDR Jordan Lee in a `Fintech compliance outbound` workspace. The fixture should include compliance-heavy fintech, regulated B2B SaaS, and marketplace ICP segments; Head of Compliance, VP Operations, and Risk / Trust & Safety personas; and 6-10 fictional account/lead rows with mixed fit, no-match, ambiguous, and low-confidence cases.

## Function Tag
A skill classification describing which GTM function(s) a skill serves, such as sales, marketing, revenue operations, customer success, partnerships, or growth. A skill can have multiple Function Tags.

## Role Tag
A skill classification describing which GTM role(s) a skill is especially relevant for, such as SDR, BDR, AE, sales ops, marketing ops, CRO, VP Sales, customer success manager, or partnerships lead. A skill can have multiple Role Tags.

## Skill Recommendation
A future product behavior that selects, composes, or tailors skills based on who the user is, their role, and the type of company they work for.

## GTM Context Home
The user-controlled local root for GTM context projects: `~/.gtm`. GTM Skills context should not live under `.agents/` because `.agents/` is agent/runtime infrastructure, while `~/.gtm` is the user's commercial operating context.

## GTM Home Registry
A root-level local metadata file at `~/.gtm/registry.json` that indexes GTM Context Projects and stores home-level state such as the active project, local active person, local active workspace, project aliases, created timestamps, last-used timestamps, and updated timestamps. It is richer than a single `.current` pointer and is not part of any shared GTM Context Repository.

## Local GTM State
User-specific state that must not be committed to a shared GTM Context Repository, including active organization/project, active person, active workspace, and local last-used state. Local GTM State lives in `~/.gtm/registry.json` by default.

## GTM Context Repo Ignore Rules
The project-level `.gitignore` rules created by `gtm-setup` to keep Local GTM State, ephemeral outputs, temporary files, and secrets out of shared GTM Context Repositories.

## GTM Project Index
The project-local machine-readable file at `~/.gtm/<organization>/gtm.yaml`. It indexes shared Organization metadata, default workspace, Business Units, Teams, People, and GTM Workspaces. It must not store user-specific active state such as active person or active workspace. Markdown files hold richer human-editable context.

## Stable Entity ID
A machine-readable key used in `gtm.yaml` maps for business units, teams, people, and workspaces. It must be unique within its collection and should not rely only on display name; for people, include a disambiguator such as email local-part, username, or numeric suffix when names collide.

## Organization ID
The stable machine-readable ID for an Organization and its repository under `~/.gtm/<organization-id>/`. `gtm-setup` should auto-generate it from the Organization display name, disambiguate on registry collisions, slugify it as lowercase kebab-case, show the ID and repo path to the user, and allow override before writing.

## Person ID
The Stable Entity ID for a Person. `gtm-setup` should auto-generate it from the display name, add an email/user/employee/numeric disambiguator when needed, slugify it as lowercase kebab-case, show it to the user, and allow override before writing.

## Workspace ID
The Stable Entity ID for a GTM Workspace. `gtm-setup` should auto-generate it from the most specific available setup context, slugify it as lowercase kebab-case, show it to the user, and allow override before writing.

## GTM Context Project
A separate git-backed context repository under `~/.gtm` for one Organization: a business, company, client, or account. It can contain many Business Units, Teams, People, and GTM Workspaces.

## GTM Context Repository
The durable folder for a GTM Context Project, git-initialized by default unless the user explicitly opts out. Setup creates an initial commit by default after successful scaffolding. It should contain only durable context for the Organization and its GTM Workspaces, not per-session research outputs. It includes canonical agent-facing instructions in `AGENTS.md` and a `CLAUDE.md` compatibility shim that imports `AGENTS.md` with `@AGENTS.md`.

## GTM Agent Instructions
Generic operating rules in `AGENTS.md` that tell agents how to resolve GTM context, handle durable vs ephemeral information, and avoid committing local state. `AGENTS.md` should not duplicate generated project state such as active person, active workspace, or current organization.

## Organization
The company, client, or business represented by a GTM Context Project. Minimum required Organization fields are stable ID and display name. Organization-level context lives in `organization.md`.

## Business Unit
A division, department, product line, subsidiary, region, or major business area within an Organization. Business Unit context is scope-oriented: what belongs in the unit, what does not, and durable high-level offerings or focus areas. Business Unit files are created only when needed.

## Team
A group of People working together inside the Organization, Business Unit, or GTM Workspace. Team context is scope-oriented: team purpose, operating scope, and durable notes about roles or membership. Team files are created only when needed and should not duplicate local active user state.

## Person
A team member or user of the GTM Context Project. Minimum operational fields are display name, free-text role, default workspace, and path. Person context can also include email, user-approved links/sources, focus, team membership, business-unit membership, territory, goals, and working preferences, and can live under `people/`.

## Active Person
The identified person using the GTM Context Project in the current session. The Person record is shared context in `gtm.yaml` and `people/<person>.md`, but the current user's active-person selection is Local GTM State and must not be committed.

## Full Context Chain
The minimum resolvable chain from Organization to Active Person to GTM Workspace. For simple organizations this can be Organization → Person → Workspace. For larger organizations it can include Business Unit and Team, such as Organization → Business Unit → Team → Person → Workspace.

## Setup Depth
The lightweight `gtm-setup` choice that determines whether the initial full context chain is simple/default or includes a Business Unit, Team, or both.

## Required Setup Question
A `gtm-setup` question whose answer is needed to create or select a valid GTM Context Project, such as Organization name, active Person identity, free-text role, setup depth, generated ID confirmation/override, and enough information to form the minimum full context chain.

## Enrichment Question
An optional `gtm-setup` question used to improve generated context, often through source-assisted research and confirmation. Missing or unresolved enrichment answers do not block setup; they can be skipped, left blank, or recorded as open questions.

## GTM Setup Model
The in-memory representation `gtm-setup` builds before writing files. It resolves the Organization ID, Person ID, Workspace ID, optional Business Unit ID, optional Team ID, paths, and references so generated files can be written in a deterministic order.

## Source-Assisted Setup Enrichment
An optional `gtm-setup` step where the user provides organization, product, and personal profile/source links so the agent can research and draft initial durable context. Drafted context is shown to the user and written only after confirmation; skipped or unavailable enrichment leaves sparse templates.

## Setup Source Link
A public or user-approved link provided during `gtm-setup` to support source-assisted enrichment, such as an organization website, product page, proof page, company social profile, or active Person profile. Confirmed source links are durable markdown context; sensitive, secret-bearing, signed, or unapproved internal links must not be committed.

## Starting Evidence
Durable source context that gives later GTM skills a good first place to look, but is not guaranteed truth. Saved source links, confirmed context, safe source labels, newly found evidence, and unresolved open questions should be distinguished when researching, scoring, or segmenting.

## Source Provenance
The explanation of where an important research, scoring, or segmentation claim came from: workspace context, saved source links, safe source labels, newly found evidence, or unresolved open questions. Provenance makes outputs auditable without making ephemeral outputs durable.

## Provenance Entry
A lightweight source-provenance item in a research, scoring, or segmentation output. Important evidence can use structured fields (`Claim`, `Source`, `Type`, `Freshness`, `Confidence`); simple evidence can use compact inline provenance. Canonical source types are `workspace-context`, `saved-source-link`, `safe-source-label`, `newly-found-evidence`, `user-provided-context`, and `open-question`.

## Bulk Provenance
Compact per-record source provenance carried by bulk research, scoring, and segmentation outputs. CSV/table bulk outputs should include scannable fields such as `top_evidence`, `confidence`, and `open_questions`; richer JSON/YAML/markdown outputs can include structured Provenance Entries per record.

## Bulk Run Summary
A concise aggregate summary included with every bulk research, scoring, or segmentation run. It reports record counts, fit/segment distributions, low-confidence and open-question counts, records needing review, top evidence patterns, and common open questions so users can understand the batch without reading every record.

## Result Confidence
A required `low`, `medium`, or `high` judgment on every research, scoring, or segmentation result. If confidence cannot be judged, the result uses `low` and explains why in Result Reasoning.

## Result Reasoning
A required short paragraph on every research, scoring, or segmentation result that explains both the result and the confidence level. Reasoning summarizes the strongest evidence, important gaps, and material uncertainty without replacing Source Provenance.

## Needs Review
A required boolean on every research, scoring, or segmentation result indicating whether a human still needs to inspect the result before acting. New unreviewed low-confidence results start with `needs_review: true`; medium or high confidence can still require review for workflow, compliance, sensitivity, private-source, ambiguity, conflict, or disqualifier reasons. Human review can clear the gate by setting `needs_review: false` and updating Result Reasoning. The review trigger or review outcome should be clear from Result Reasoning, confidence, open questions, and provenance rather than a separate review-reasons or override field. `needs_review: true` gates automated downstream actions by default; `needs_review: false` makes a result automation-eligible but does not itself authorize side effects.

## Automation Policy
A future configured rule or integration permission that authorizes downstream side effects such as sending outreach, updating CRM, enriching durable context, marking records ready in external systems, triggering campaigns, or syncing results. Automation Policy is separate from Needs Review: ready results still need explicit user instruction or policy authorization before side effects execute. Automation Policy design is out of scope for the MVP; MVP side effects require explicit user instruction in the moment plus a Side-Effect Preview and confirmation.

## Side-Effect Preview
A concise, summary-first pre-execution summary shown before an MVP skill performs side-effecting actions such as sending outreach, updating CRM, enriching durable context, marking external records ready, triggering campaigns, syncing systems, or writing durable changes from research/scoring/segmentation outputs. It states the action, target, affected counts, important exclusions such as review-gated records, and whether outreach/CRM/campaign/durable writes will happen. It does not dump full row lists for large batches by default; detail is shown for small batches, user-requested detail, errors/conflicts, or unusually sensitive actions. Durable GTM context writes use file/section summaries by default, with raw diffs only when requested, small, conflict-heavy, sensitive, destructive, or needed for clarity. Execution waits for user confirmation of the preview.

## Assistive Uncertainty Preview
A plain-language accept/deny preview shown when the agent can do useful work for a mostly nontechnical user but a material uncertainty remains. It explains what will happen, what will not happen, and what could be included, skipped, published, or left local. The agent should do safe discovery, choose safe defaults first, and include its recommended choice by default when presenting options, then ask for approval instead of making the user solve technical details.

## Durable Context Write Preview
A Side-Effect Preview for durable GTM Context Repository writes. It summarizes target files and sections to create, update, preserve, or delete instead of dumping raw full diffs by default. It calls out conflicts, unresolved questions, sensitive-source handling, whether non-context side effects such as outreach/CRM/campaign triggers will happen, whether a git commit will be created, and when practical whether existing unrelated working-tree changes will be left uncommitted. Raw diffs are available when requested or necessary for clarity.

## Commit-Safe Context Change
A durable GTM context change eligible for automatic git commit because it is generated scaffold/repair content, deterministic skill-owned context from explicit user input, source-assisted context the user reviewed and approved, approved conflict/unclear-case resolution, or a clear non-destructive update. It excludes secrets, tokenized/signed/invite/local links, unapproved private source URLs, unresolved conflicts represented as facts, unreviewed `needs_review: true` results promoted to ready context, unapproved destructive rewrites, and unexpected files outside the GTM Context Repository scope.

## GTM Context Auto-Commit
The default that confirmed durable GTM context writes create a git commit when every written change is a Commit-Safe Context Change. The Durable Context Write Preview states whether a commit will be created and shows the proposed commit message; the Side-Effect Execution Summary reports commit status and commit hash when available, or says changes remain uncommitted. Auto-commit stages and commits only the current confirmed action's isolated change set, never unrelated pre-existing working-tree changes. If target files or sections have pre-existing uncommitted edits that make isolation unclear, auto-commit is skipped. If files write successfully but auto-commit fails, the write is not rolled back; the summary reports the blocker and that changes remain uncommitted. Auto-commit never pushes by default in the MVP.

## GTM Context Push
Publication of one or more local GTM Context Repository commits to a configured git remote and branch. It is a side effect separate from auto-commit. In the MVP it happens only on explicit user request or under a future workflow/integration that defines push behavior, and its Side-Effect Preview names the remote, branch, and commits or commit range when known.

## Auto-Commit Change Set
The files or isolated changes produced by the current confirmed durable GTM context action and eligible for auto-commit. It excludes unrelated pre-existing working-tree changes, local active state, ignored files, secrets, and any ambiguous overlap that cannot be confidently attributed to the current action.

## Unrelated Working-Tree Change
An uncommitted repository change that was not produced by the current confirmed durable GTM context action. Auto-commit must leave unrelated working-tree changes uncommitted and should report them when practical.

## Non-Blocking Auto-Commit Failure
A failed git commit after successful durable GTM context writes. It does not undo or invalidate the file write. The Side-Effect Execution Summary should report the exact blocker when available, changed files/sections, and that changes remain uncommitted.

## Side-Effect Execution Summary
A concise post-action summary produced after a confirmed side-effecting action executes. It reports what actually happened: records/files considered, created, updated, deleted, unchanged, skipped, or failed; records skipped because `needs_review: true`; whether outreach, CRM updates, campaign triggers, syncs, durable writes, git commits, or pushes actually occurred; commit status/hash for durable GTM context auto-commits; push status when a push was explicitly requested; unrelated working-tree changes left uncommitted or isolation-related commit skips when relevant; and safe follow-up handles or concise failure details when useful. Side-Effect Execution Summaries are ephemeral by default in the MVP and are saved/exported only on explicit user request, as part of a confirmed durable side effect, or under a future integration/audit policy.

## Source Link Classification
The safety classification `gtm-setup` applies before saving a source link: public-looking links can be saved after normal enrichment confirmation, internal/private-looking links require explicit confirmation before committing, and secret-bearing, signed, tokenized, invite, credential-bearing, or local-only links must not be committed.

## Safe Source Label
A non-sensitive markdown note saved when a private or sensitive source link was used to support confirmed setup context but the URL itself must not be committed. Safe labels describe the source type and setup use without including URLs, tokens, document IDs, invite codes, or sensitive project details.

## Confirmed Setup Enrichment
Source-assisted setup context that the user has approved during `gtm-setup`. Confirmed enrichment is durable setup context and is included in the initial commit; unconfirmed enrichment remains ephemeral and must not be committed.

## Enrichment Confirmation Preview
The section-by-section review shown by `gtm-setup` before writing source-assisted enrichment. It groups proposed durable context by target file and section, shows source context and proposed Safe Source Labels where useful, and lets the user apply all, edit, apply selected sections, keep sparse templates, or add more links and retry.

## Enrichment Clarification
A focused question `gtm-setup` asks when source-assisted enrichment finds conflicting or unclear information that matters to durable GTM context. Resolved answers become confirmed setup enrichment; unresolved claims stay out of factual sections and may be recorded as open questions.

## Non-Blocking Enrichment Clarification
The rule that unresolved source-assisted enrichment questions block only the affected optional claim, field, or section, not the whole `gtm-setup` flow. Required setup fields still block when missing; optional unresolved enrichment can be left blank or recorded as an open question.

## Omitted Unknown Optional Field
A generated `gtm.yaml` convention: required fields are always written, known optional fields may be written, and unknown optional fields are omitted rather than represented as `null`. Missing optional fields mean unknown/not captured.

## Idempotent GTM Setup
The requirement that `gtm-setup` can be run repeatedly without destructive overwrites. Existing context files are preserved by default, missing scaffold pieces can be added or repaired, unknown fields in `registry.json` and `gtm.yaml` are preserved, and local active state is updated only after the target project is valid enough to use.

## GTM Setup Summary
The concise final report printed by `gtm-setup` after successful create/select/validate/repair. It shows the Organization ID and path, active local Person and Workspace, files created/preserved/repaired, git initialization/commit status, and next recommended skills.

## Ignored Local and Ephemeral Files
Files that must stay out of a shared GTM Context Repository: local active-state overrides, personal agent instructions, secrets, temporary artifacts, logs, and raw per-session outputs. Durable learnings should be promoted into organization, person, workspace, or skill-owned context files instead.

## GTM Workspace
The active operating scope for GTM work: a combination of Business Unit, Offering, Market, GTM Motion, Team, and/or Role focus. Minimum required workspace fields are display name and path. Workspace context lives under `workspaces/<workspace>/`. Skill-owned files such as `icps.md`, `personas.md`, and `scoring.md` belong to the relevant GTM Workspace.

## Offering
The product, service, package, or solution being sold within a GTM Workspace.

## Market
The target geography, vertical, company-size band, segment, or buyer market for a GTM Workspace.

## GTM Motion
The commercial motion for a GTM Workspace, such as outbound, inbound, PLG, enterprise sales, channel/partnerships, lifecycle, or customer expansion.

## Foundation-First MVP Slice
The first implementation slice for GTM Skills: build `gtm-setup`, `~/.gtm/registry.json` handling, GTM Context Repository scaffolding, organization/person/workspace/context resolution, skill metadata and structure validation, and core templates before implementing downstream GTM workflow skills.

## GTM Setup Scaffold File Set
The files and folders `gtm-setup` creates for a new GTM Context Repository: `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `gtm.yaml`, `organization.md`, `business-units/`, `teams/`, `people/<person-id>.md`, and `workspaces/default/context.md`. Skill-specific durable files such as `icps.md`, `personas.md`, and `scoring.md` are created only when their owning skills are invoked.

## Skill-Owned Context File
A durable context file created and maintained by a specific skill or skill family inside the relevant GTM Workspace, such as `workspaces/<workspace>/icps.md` for `define-icp`, `workspaces/<workspace>/personas.md` for `define-personas`, and `workspaces/<workspace>/scoring.md` for scoring skills. `gtm-setup` should not pre-create Skill-Owned Context Files.

## Static GTM Context
Durable, reusable context that agents and skills should read across sessions: ICPs, personas, scoring models, product/offer context, proof points, disqualifiers, messaging, and workflow instructions.

## Ephemeral GTM Output
Task-specific artifacts produced during a session, such as an account research brief for Volvo as a potential customer for Google. Ephemeral GTM Output should not be written into the GTM Context Repository by default.
