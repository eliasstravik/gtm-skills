# gtmskills-omni Build Plan

> **For agentic workers:** Execute tasks strictly in order, one task per fresh session (recommended) or straight through. Every task ends in a commit; resume by reading this file plus `git log`. Steps use checkbox (`- [ ]`) syntax for tracking. REQUIRED SUB-SKILLS: `/skill-creator` (process authority) and `/skill-issue` (form authority) — invoke both at the start of every skill task.

**Goal:** Build nine GTM skills + committed eval evidence in this repo — the equivalent of the reference repo `~/dev/gtmskills`, rebuilt from scratch under the two-surface concept-map decisions.

**Architecture:** A skills package repo (`skills/<name>/` shipping surface, `evals/<name>/` committed evidence) whose nine skills operate on *fractal GTM context repos* — plain git repos, one per company. Skills are byte-identical across surfaces (desktop CLI and Vercel eve) under a seven-clause portability contract. No machine state exists anywhere: position is derived from cwd, operator from git identity.

**Tech Stack:** SKILL.md open standard; skill-creator tooling (`quick_validate.py`, `aggregate_benchmark.py`, `run_loop.py`, `generate_review.py --static`); `npx skills add` installer; git.

**Reference material (committed in this repo):** `research/gtmskills-anatomy.md` (the reference spec extracted from the old repo — consult per skill), `research/build-loop-constraints.md` (the distilled skill-creator/skill-issue demands), `CONCEPT-MAP.md` (the two-surface decisions). The old repo at `~/dev/gtmskills` is **read-only reference**: mirror contracts and conventions, never copy files wholesale.

---

## Global Constraints (the law — every task inherits these)

### G1. The adapted context model

Skills operate on **GTM context repos**: one plain git repo per company. Layout (unchanged from the reference spec):

- Every org node — root and each `suborgs/<id>/` — has `org.md`, optional `icps/`, `personas/`, skill-owned files, nested `suborgs/<child>/`.
- Root-only: `AGENTS.md` (the constitution), `CLAUDE.md` containing exactly `@AGENTS.md`, `.gitignore`, `people/<person-id>/person.md`. People never live under suborgs.
- Ids lowercase kebab-case; H1 of `org.md`/`person.md` is the display name; no empty dirs, no placeholder files.
- **Canonical org paths omit `suborgs/` segments**: root = empty path; `cloud/emea` ↔ `suborgs/cloud/suborgs/emea`.
- Inheritance: read the `org.md` chain root→active org; collections flow down; nearest same-stem file wins on collision; skill-owned files resolve nearest-wins walking up from the acted-on org.
- Labels are org-qualified: `<org-path>/<file-stem>`, bare `<file-stem>` at root.

**There is NO machine state.** No `$GTM_HOME`, no `state.json`, no registry, no pin files — a `state.json` found anywhere is a defect (doctor removes it). Derivations replace pins:

- **Position** = cwd. Standing at repo root = root org; standing in `suborgs/cloud/suborgs/emea` = org `cloud/emea`. An explicit org in the user's request overrides for that invocation only; nothing sticky. (On eve, position comes from the channel→node map; skills just consume "the resolved position".)
- **Operator** = derived from git identity: match `git config user.name`/`user.email` against `people/<id>/person.md` content. Explicit "as X" in the request overrides per invocation. No match → ask once; the answer lives only in the conversation. The operator is **never** the lead/account being worked on.
- **Position echo** before acting, in every skill: `Working in <repo-name>/<org-path> as <person>` (omit ` as <person>` when no operator is resolvable and none is needed).
- **Durable writes** = "persist artifact": preview the complete exact content → ask approval in the same message → write byte-for-byte → stage only the owned file(s) → verify staged diff → one non-amending commit → `git pull --rebase && git push` when a remote exists (no remote = solo degenerate case, commit only; push rejection → rebase and retry, never force). One commit per completed artifact.
- **Ephemeral outputs** (segmentation, scoring, non-promoted research) are response-only: never written to any file, ending with an explicit no-side-effects statement.

### G2. The portability contract (all nine skills MUST conform)

1. No keyboard assumptions (one-question-at-a-time and approval gates phrased so a Slack thread reply satisfies them).
2. Capabilities, not credentials (name what's needed — "web access", "a calculator" — never specific tools, paths to personal config, or auth).
3. Identity awareness (laptop acts as the human; eve acts as the app; actions that only make sense at a keyboard **refuse-and-redirect**: "run this from your CLI").
4. Declared gate tiers (see G3 table; skills never invent gates in free-tier flows, never skip the preview→confirm contract on repo-gated writes).
5. Abstract persist-artifact writes (skills describe the write per G1; never reference GitHub APIs, tokens, or surface-specific mechanisms).
6. Location-derived position (per G1; never a pin file, never "the active workspace").
7. Scratch is scratch (nothing durable outside the context repo; no notes files, no caches).

### G3. Gate-tier verdicts (embed the relevant row in each skill's behavior)

| Skill | Surfaces | Gate tiers |
|---|---|---|
| gtm-setup | Both; **repo birth (create/import) refuses-and-redirects on eve** | Reads free; scaffold/repair writes repo-gated + preview→confirm |
| gtm-define-icp | Both | Reads free; the one ICP write repo-gated + preview→confirm |
| gtm-define-personas | Both | Reads free; the one persona write repo-gated + preview→confirm |
| gtm-account-segmentation | Both | Free; read-only, ephemeral; no invented gates |
| gtm-account-scoring | Both | Free; read-only, ephemeral |
| gtm-account-research | Both | Research free; promotion repo-gated + preview→confirm |
| gtm-lead-segmentation | Both | Free; read-only, ephemeral |
| gtm-lead-scoring | Both | Free; read-only, ephemeral |
| gtm-lead-research | Both | Research free; promotion repo-gated + preview→confirm |

No action in any skill is approval-gated (nothing outward-facing exists in this family).

### G4. Form authority: skill-issue (wins every conflict about the shipped file)

Exactly one core primitive per skill; bare core = H1 + the primitive's H2, ≤20 body lines, proven by fresh with/without runs **plus a blind forced comparison** before any Details line exists; one Details section, every line traceable to an assertion the bare core failed (≤80 Details lines, ≤100 total body lines); overflow via one-level Calls with explicit triggers/outputs/fallbacks; descriptions third-person, model-invoked descriptions **start with `Triggers when`** and state only observable triggering conditions and exclusions; eval evidence stays outside the shipping skill dir.

### G5. Process authority: skill-creator (wins every conflict about how the build runs)

The per-skill Loop in the next section is skill-creator's steps A–L (see `research/build-loop-constraints.md` §1 for line-cited detail) with these standing adaptations:

- **Autonomous waiver (client-granted, 2026-08-02):** no per-skill human gates. The agent self-reviews: generate the viewer via `generate_review.py --static`, read every transcript, act as its own harshest reviewer under `agents/grader.md` standards, and record findings. "Feedback empty after honest self-review" = the exit criterion.
- **Jurisdiction rule:** description optimization runs, but the improver is instructed to generate only `Triggers when`-conforming candidates; the best *conforming* candidate is applied verbatim. If `run_loop`'s winner violates G4 grammar, take the best conforming candidate from its history instead.
- Details lines may only be added for **failed assertions**; an insight from a transcript gets its assertion authored first, then the line.
- `run_loop.py` always with `--report none`; trigger evals run from the repo root (transient `.claude/commands/` files are cleaned up; never commit them); the reviewed eval set is saved as `evals/<name>/trigger-eval.json` (never left in `~/Downloads`).
- `quick_validate.py` runs explicitly as every skill's validation gate.

### G6. Repo conventions

- `skills/<name>/` ships verbatim to installers — nothing lands there except what installers receive. `evals/<name>/` holds committed evidence: `evals.json`, `assertions.md`, `fixtures/` (+ `fixtures/README.md`), `no-skill-failures/`, `trigger-eval.json`, `description-optimization.md`, one `iteration-N-results.md`. This evals-outside-the-skill-dir layout is the **declared deviation** from skill-creator's default, mandated by skill-issue gate 10.
- `.gitignore`: `skills/*-workspace/`, `evals/*/runs/`, plus standard macOS/python/node entries.
- **Baseline purity:** no-skill arms run with a prompt forbidding invocation of any installed skill; with-skill arms MAY use installed siblings; the grader checks transcripts and flags contaminated baselines.
- **Fixtures are pristine context repos** (a directory shaped per G1 — AGENTS.md/CLAUDE.md/.gitignore from gtm-setup's shipped templates *verbatim*, no nested `.git`, never a `state.json`, no rubric files). Run prep, embedded in every eval prompt: copy the fixture into `<run-dir>/outputs/<repo-name>/`, `git init` the copy, `git config user.name "<fixture person display name>" && git config user.email "<fixture person email>"`, commit everything (dotfiles included) as `fixture baseline`, then operate with the copy as cwd. Eval subagents never touch any real context repo.
- **Interactive flows in evals:** prompts embed a scripted `user_replies` array consumed in order; assertions verify the skill *asked* and *previewed* (the contract), not that live turns occurred. Empty reply scripts never imply a required question.
- Every eval subagent saves `transcript.md` in its run dir. Eval dirs are named `eval-<ID>-<descriptive-name>`. **Harness requirements live only in `evals.json`'s conventions block — never in a shipping SKILL.md.**
- Source packets for research evals live in a `sources/` directory *beside* the copied repo in the run dir (documented in each fixture README) — supplied material, not context-repo content.
- Model policy: none. Use the session's model for everything; record which model ran what, honestly, in each `iteration-N-results.md`.

---

## The Loop (run once per skill task; "the Loop" below means exactly this)

- [ ] 1. Invoke `/skill-creator` and `/skill-issue`. Re-read this plan's Global Constraints and the skill's task spec below; read the skill's section in `research/gtmskills-anatomy.md`.
- [ ] 2. Record the four intent answers (what it enables / when it triggers / output format / are test cases objective) in the workspace.
- [ ] 3. Write the **bare core**: frontmatter (`name`, placeholder `Triggers when` description) + H1 + the task-specified core primitive in its mandated form, ≤20 body lines.
- [ ] 4. Author 3 eval scenarios per the task spec into `evals/<name>/evals.json` (prompts, `user_replies`, `expected_output`, the G6 conventions block); build the fixture repos under `evals/<name>/fixtures/`.
- [ ] 5. Draft `evals/<name>/assertions.md`: lettered, objectively checkable, `(critical)` markers on contractual behavior, plus a failure→assertion traceability table maintained from here on.
- [ ] 6. Spawn with-skill AND no-skill baseline runs for all 3 evals **in the same turn** into `skills/<name>-workspace/iteration-1/eval-<ID>-<descriptive-name>/{with_skill,without_skill}/`; save `timing.json` per run on each completion notification; preserve verbatim baseline failures into `evals/<name>/no-skill-failures/`.
- [ ] 7. Grade every run (`grading.json`, exact fields `text`/`passed`/`evidence`; script the programmatically checkable assertions); run `python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>`; run the analyst pass; generate the static viewer (`generate_review.py <workspace>/iteration-N --static ...`) **before** forming your own judgment; then self-review every transcript against the assertions.
- [ ] 8. Run the **blind forced comparison** of bare-core-with-skill vs baseline per `agents/comparator.md` (mandatory — G4). Record the verdict.
- [ ] 9. Earn Details: for each failed assertion only, add the minimal Details line(s); overflow to `references/` via one-level Calls. Iterate (steps 6–9, `iteration-2/`, `iteration-3/`, …) until every critical assertion passes and self-review finds nothing — then write `evals/<name>/iteration-N-results.md` (benchmark table, model used, what each iteration changed and why).
- [ ] 10. Description optimization: generate 20 trigger queries (10 positive with varied phrasing, 10 tricky near-miss negatives) → self-review them → save `evals/<name>/trigger-eval.json` → `python -m scripts.run_loop --eval-set ... --skill-path ... --model <session-model> --max-iterations 5 --report none` with the G5 `Triggers when` constraint → apply the best conforming description verbatim → record before/after and scores in `evals/<name>/description-optimization.md`.
- [ ] 11. Gates: `python scripts/quick_validate.py skills/<name>` passes; the full skill-issue checklist passes (record it in `description-optimization.md` or `iteration-N-results.md`); body ≤100 lines; no eval-harness language in the shipping skill.
- [ ] 12. Install and verify: `npx skills add <this-repo-abs-path> --skill <name> -g`; diff the installed copy against `skills/<name>/` — must be byte-identical.
- [ ] 13. Commit everything for this skill (shipping dir + eval evidence; workspaces stay ignored): `git commit -m "Build <name>: done-gate passed"`.

---

## Task 0: Repo scaffolding

**Files:** Create `README.md`, `.gitignore`, `VERSION` (`0.1.0`), empty `skills/` and `evals/` directories.

- [ ] Write `.gitignore` per G6.
- [ ] Write `README.md`: the nine skills in build order, the install command, a five-line summary of G1 (fractal context repos, no machine state, cwd position, git-identity operator, persist-artifact writes).
- [ ] Commit: `chore: scaffold skills package repo`.

## Task 1: gtm-setup

**Core primitive:** Switch (routes condition→flow, retains ownership). **Support files:** `references/context-contract.md` (G1 restated as the installable contract + doctor checks + source-link safety), `references/setup-flows.md` (create / import / add-suborg / add-person / doctor flows), `templates/{AGENTS.md,CLAUDE.md,gitignore,org.md,person.md}`.

**Contract:** Create or import a GTM context repo, add suborgs and people, validate and repair — the recovery target when any other GTM skill cannot resolve context. Switch rows: create new repo · import existing directory · add suborg · add person · doctor/repair · another-GTM-skill-recovery entry. **Deleted from the reference skill:** load/switch flows, all `state.json`/`$GTM_HOME` handling, person pinning. **Added:** remote wiring in create/import (offer `git remote add` + push when the user has a remote; absent remote is legal); doctor checks for G1 derivations (git identity matches a person in `people/`, `state.json` anywhere = defect to remove, `AGENTS.md`/`CLAUDE.md` match the packaged templates); **eve refusal row**: create/import invoked off-laptop → refuse-and-redirect ("repo creation needs a keyboard: run gtm-setup from your CLI"), all other flows proceed anywhere.

**Templates:** adapt the reference templates to G1 — `AGENTS.md` is the context-repo constitution: repo model, canonical paths, inheritance, position-from-cwd, operator-from-git-identity, persist-artifact write rules, ephemerality rules, artifact-ownership taxonomy, "only gtm-setup scaffolds". `CLAUDE.md` = exactly `@AGENTS.md`. `gitignore` = `.tmp/`, `*.log`. `org.md`/`person.md` = `{{placeholder}}` H1 + fixed H2 skeletons; `person.md` includes an `Email` line (operator matching keys on it).

**Behavior rules (assertion targets):** exactly one question per message, numbered choice lists ending `Reply with a number, or type your answer.`, at most one `(Recommended)`; complete file contents previewed with approval asked in the same message before any write; position echo; closing summary; secret/tokenized/invite links never persisted nor echoed verbatim — safe label + rotation advice; never guess company facts from model memory.

**Eval scenarios:** (1) create-workspace from an empty directory — scripted replies include a pasted tokenized sheet link that must be safe-labeled; (2) import-repair — fixture is a deliberately broken repo (committed `state.json`, uppercase org id, person under a suborg, template-drifted AGENTS.md); (3) add-suborg + doctor pass on a healthy two-level repo, including the refuse-and-redirect row exercised via a scripted "pretend you are on the team chat surface" probe.

- [ ] Run the Loop for gtm-setup.

## Task 2: gtm-define-icp

**Core primitive:** Recipe (~10 steps). **Support files:** none.

**Contract:** Create or refine exactly one ICP file per run: `<target-org>/icps/<icp-id>.md`, H1 + H2s in order — Identity, Account Profile, Fit Signals, Buying Context, Disqualifiers, Evidence And Confidence, Review Needs, Open Questions; Identity records `Qualified label` and `Status` (`draft` vs preserved `working definition`). Position/operator per G1 (Recipe step 1 = derive position from cwd, echo it); altitude inference may retarget to a suborg after explicit confirmation. The single durable write follows G1 persist-artifact with the full single-message approval gate (path + purpose + no-external-side-effects statement + complete exact Markdown + the question). Refinement preserves unrelated sections byte-identically.

**Eval scenarios:** (1) create first ICP at root; (2) refine an existing ICP preserving a `Sales Observations` section byte-identically; (3) altitude mismatch — user stands at root but describes a suborg-owned product, skill must confirm retargeting. Fixture prep per G6 (SHA-256 the untouched files to prove preservation).

- [ ] Run the Loop for gtm-define-icp.

## Task 3: gtm-define-personas

**Core primitive:** Recipe (~10 steps). **Support files:** none.

**Contract:** One persona file per run: `<target-org>/personas/<persona-id>.md`, H1 + H2s in order — Identity, Titles And Responsibilities, Buying Role, Pains And Priorities, Objections And Disqualifiers, Outreach Hooks, ICP Relevance, Evidence And Confidence, Review Needs, Open Questions; Identity records `Display name` and `Qualified label`. Bad-fit contacts become disqualifier guidance, never a synthetic persona. ICP labels copied exactly into ICP Relevance, never embedded in the persona label. All git anchored at the context-repo root (`git -C <repo>`). Same approval gate and altitude rule as Task 2; altitude explanations name the owning org's visible ICP label.

**Eval scenarios:** (1) create first persona; (2) refine preserving `Call Notes` byte-identically; (3) altitude mismatch to a suborg.

- [ ] Run the Loop for gtm-define-personas.

## Task 4: gtm-account-segmentation

**Core primitive:** Recipe (~8 steps). **Support files:** none.

**Contract:** Read-only, free tier, zero writes, zero questions when inputs are complete. Assign each account exactly one *visible* qualified ICP label or `no-match`; one-off and bulk modes with fixed literal field sets; position echo (the "working line") precedes any classification, even preliminary; ends with metadata including an explicit no-side-effects statement. Confidence/needs_review calibrated to account-level evidence gaps — never to the ICP's own maintenance backlog. Nearest same-stem ICP wins; non-colliding inherited ICPs stay visible. Repository-relative source paths.

**Eval scenarios:** (1) one-off root match; (2) bulk 4-account table where the all-unknowns account is the only low-confidence/review row; (3) child precedence — `emea/enterprise` overrides root `enterprise`, root `mid-market` stays visible.

- [ ] Run the Loop for gtm-account-segmentation.

## Task 5: gtm-account-scoring

**Core primitive:** Recipe (~9 steps). **Support files:** none.

**Contract — DELIBERATE DIVERGENCE from the reference repo (client decision 2026-08-01, do not "fix" back):** there are **no rubric files and no arithmetic**. The skill takes accounts with a `segment_label` (validated as `no-match` or an exact visible ICP label), reads the matched ICP, and returns a **fit judgment**: `Band` ∈ {`strong-fit`, `good-fit`, `weak-fit`, `no-fit`} + `Rationale` (cites specific Fit Signals matched and Disqualifiers hit, by name) + `Confidence` ∈ {high, medium, low} + `needs_review` flag. `no-match` labels map to `no-fit` without re-segmentation. A hit disqualifier caps the band at `weak-fit` and must be named. Read-only, ephemeral, no invented gates; one-off and bulk modes with fixed literal fields; bulk ends with a band distribution summary; explicit no-side-effects statement.

**Eval scenarios:** (1) one-off strong-fit with three named fit signals; (2) bulk four accounts spanning all four bands, including one whose hit disqualifier must cap it at weak-fit despite otherwise strong signals, and one `no-match` → `no-fit`; (3) child precedence — the account's owning suborg ICP (not root) is the judgment basis. Assertions are judgment-graded: band vocabulary exact, rationale cites real ICP content, disqualifier handling, consistency across the bulk table.

- [ ] Run the Loop for gtm-account-scoring.

## Task 6: gtm-account-research

**Core primitive:** Recipe (~10 steps). **Support files:** none.

**Contract:** Dual mode. Normal research (free tier, response-only): evidence-backed briefs from supplied source packets and the context repo, discipline of separated inspected findings / unverified claims / hypotheses / conflicts / open questions; priority bands high / medium / `research-needed` (never renamed). **Promotion** (repo-gated): writes one `<target-org>/research/<account-id>.md` with the reference repo's fixed 16-H2 schema (copy it from `research/gtmskills-anatomy.md` §2.6 / the old skill), after the full G1 persist-artifact ritual; physical-vs-canonical path derivation spelled out. Tokenized/unsafe source links rejected or safe-labeled, never opened or reproduced. Approval replies are consumed, never re-asked.

**Eval scenarios:** (1) one-off brief with three conflicting headcounts + an unsourced claim that must land in unverified; (2) bulk with a private tokenized link that must be safe-labeled without exposure; (3) promotion into a suborg with scripted "Approve exactly as previewed."

- [ ] Run the Loop for gtm-account-research.

## Task 7: gtm-lead-segmentation

**Core primitive:** Recipe (~9 steps). **Contract:** persona analogue of Task 4: exactly one visible qualified persona label or `no-match`; responsibilities/scope outrank title; literal one-off fields, literal bulk column template, literal metadata names; explicitly **no interactive gate** (empty reply scripts never imply a question; first visible content after any skill-use notice is `Sources read:`); the operator (per G1) is never the lead being segmented.

**Eval scenarios:** (1) responsibility-beats-title one-off; (2) bulk with an external-advisor disqualifier and a title-only lead as the sole review case; (3) child override with a supplied-evidence rejection.

- [ ] Run the Loop for gtm-lead-segmentation.

## Task 8: gtm-lead-scoring

**Core primitive:** Recipe (~9 steps). **Contract:** persona analogue of Task 5, same deliberate divergence: fit judgment of leads against the matched persona — same band vocabulary, rationale citing the persona's responsibilities/pains/buying-role content, disqualifier caps, `no-match` → `no-fit`, confidence + needs_review, bulk summary, read-only, no gates. Missing key lead facts (e.g. no title and no responsibilities) → `Confidence: low` + needs_review, never a refusal.

**Eval scenarios:** (1) one-off strong-fit; (2) bulk four leads spanning bands with one disqualifier cap and one missing-facts review case; (3) child persona precedence.

- [ ] Run the Loop for gtm-lead-scoring.

## Task 9: gtm-lead-research

**Core primitive:** Recipe (~10 steps). **Contract:** person analogue of Task 6; promotion target `<target-org>/research/leads/<lead-id>.md` with the reference 16-H2 person schema (from `research/gtmskills-anatomy.md` §2.9); **`people/` is not the research namespace** (people/ = durable person entities owned by gtm-setup; research/leads/ = promoted research); `research-needed` never renamed; same source-safety and promotion ritual.

**Eval scenarios:** (1) title-conflict one-off; (2) bulk with a tokenized person link; (3) promotion of `suborgs/emea/research/leads/<id>.md` with scripted approval.

- [ ] Run the Loop for gtm-lead-research.

## Task 10: All-nine trigger smoke + parity record

- [ ] Build the routing matrix: all nine authoritative installed descriptions + 36 queries (3 positives per skill = 27, plus 9 out-of-scope expecting `none`). Reuse each skill's strongest trigger-eval queries where possible; the 9 negatives must include score-vs-segment and account-vs-lead near-misses.
- [ ] Run the matrix with the session model (each query judged against all nine descriptions at once, 3 runs per query, majority vote). Acceptance: **36/36** — every skill catches its 3 positives, no sibling steals a case, all 9 negatives route to `none`. Any failure → fix the offending description via step 10 of the Loop, re-run.
- [ ] Write `FULL-PARITY.md`: date, the matrix results, per-skill done-gate summary, **honest model reporting** (exactly which model(s) executed builds, evals, and the smoke), and the note that publishing decisions stay with the client.
- [ ] Final commit; report completion to the client with the benchmark table for all nine skills.

---

## Completion criteria

All nine skills committed with passing done-gates and byte-identical global installs; all committed evidence present per G6; 36/36 smoke; `FULL-PARITY.md` honest; nothing under `skills/<name>/` but what installers should receive; zero occurrences of `state.json`, `$GTM_HOME`, or eval-harness language in any shipping skill.
