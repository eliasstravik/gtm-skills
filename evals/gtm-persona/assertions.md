# gtm-persona requirements and assertions

All assertions below are contractual unless marked diagnostic. The old `gtm-define-personas` skill supplied only the intent to define and refine a buyer or stakeholder persona; none of its text, fixed schema, operator model, inherited visibility, or altitude machinery is carried forward.

## Shared contract

- **C01** Resolve a repo in this order: request-named, environment-connected, otherwise enumerate valid `~/.gtm/` repos and ask.
- **C02** State `Using GTM workspace: <display name> — <N> personas visible` before acting or judging.
- **C03** Visibility is node-local: root never sees suborg personas, and a targeted suborg never sees root or sibling personas.
- **C04** Ask one question per message, directly rendered in bold; discrete choices are numbered, have at most one first-position `(Recommended)`, and end exactly `Reply with a number, or type your answer.` Never use `AskUserQuestion`.
- **C05** Apply link safety before opening or echoing a source. Unsafe URLs are represented only by a plain source label.
- **C06** Preview every durable change completely and repeat accept/change/cancel until accepted or cancelled.
- **C07** Accepted writes stay on `main`, stage only accepted paths, never force-push, and close with “saved to history” language. Git failures become plain-English numbered recovery choices.
- **C08** No cwd-derived position, git-identity operator, `Working in … as`, machine state, inherited artifact rules, fixed section schema, or migration behavior appears.
- **C09** New personas use `personas/<slug>/PERSONA.md` and remain factual, flat, small, freeform Markdown; legacy `personas/<slug>.md` remains readable and editable without migration.
- **C10** Qualified labels use `<org-path>/<slug>` off-root and bare `<slug>` at root, where org paths omit physical `suborgs/` segments.
- **C11** An environment-declared durable-write mechanism replaces only the Git mechanism; an unavailable durable save leaves the repo unchanged and produces one direct recovery question without a success claim.

## Branch contract

- **B01 Guided menu:** no clear verb retains ownership and offers create, update, delete, or doctor; no import or clear branch exists.
- **B02 Create destination:** no suborgs means root without a question; any suborg means ask which organization owns the persona, root first as `(Recommended)`, unless the request names an org.
- **B03 Create grounding:** read the destination org chain and only destination-local personas, avoid near-duplicates, interview one question at a time, preview `personas/<slug>/PERSONA.md`, then write and save.
- **B04 Update:** list only visible personas when selection is needed, gather the change, show complete before/after content, preserve unrelated facts, then save one accepted change.
- **B05 Delete:** list only visible targets, name the owner and warn that the definition will no longer be available from that node, preview exact removal, save it, and explain history recovery.
- **B06 Doctor:** inspect only persona concerns repo-wide: placement next to `ORG.md`, lowercase-kebab slugs, display-name H1, matchable substance, and placeholder/TODO husks. Ignore ICP content. Accepted repairs are one commit.
- **B07 Template:** ship `templates/persona.md` only as a draft starting shape; valid personas need not follow it.
- **B08 Description:** third-person model-invoked description starts `Triggers when`, includes create/update/delete/doctor, and excludes ICPs and repo-level management.
- **B09 Sibling boundary:** ICP, teammate, workspace-lifecycle, lead-research, segmentation, and scoring outcomes do not mutate persona artifacts or enter the persona menu.

## Scenario coverage

- E1 proves guided-menu ownership, repo enumeration, root create, local source use, unsafe-link handling, acceptance, and history.
- E2 proves the create-destination rule, suborg-only visibility, qualified labels, and near-duplicate grounding.
- E3 proves explicit root targeting, the reverse visibility direction, complete before/after update, and byte preservation.
- E4 proves the one-obvious-node default, delete consequences, history recovery, and exact deletion.
- E5 proves repo-wide persona doctor scope, all owned checks, ignored ICP defects, and one repair commit.
- E6 proves the ICP near-miss routes to `gtm-icp` without reading or mutating personas.
- E7 proves hosted durable-save failure recovery, full preview compatibility, and byte-preserved cancellation.
