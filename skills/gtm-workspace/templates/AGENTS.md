# GTM Workspace

This repository is the durable GTM workspace for one organization.

## Shape

- The root and every `suborgs/<suborg-slug>/` organization node has `ORG.md`; suborganizations may recursively contain the same shape.
- Any organization node may carry canonical `icps/<slug>/ICP.md` and `personas/<slug>/PERSONA.md`; the root alone may carry `workflows/`, a `gtm-workflow`-owned Node project where definitions live at `workflows/<slug>.ts` or `workflows/<suborg-path>/<slug>.ts`.
- Members live under their owning organization node at `members/<member-slug>/MEMBER.md`. Their optional `Suborganizations:` line lists additional affiliations.
- Slugs are lowercase kebab-case. Each `ORG.md` and `MEMBER.md` H1 is the display name; every member has an `Email:` line.
- Do not track hidden coordination state, caches, generated indexes, run outputs, logs, empty directories, or placeholder files. Exact workflow dependency pins and its lockfile are authored content; workflow working state is allowed only when gitignored and untracked.

## Company data contract

Every newly created or fully researched `ORG.md` and `ICP.md` has a `## Company data` section with these top-level fields in order:

1. **Business types**: controlled list describing how the company serves its market; multiple values are allowed.
2. **Industries**: controlled list.
3. **Subindustries**: controlled list.
4. **Revenue streams**: controlled list; multiple values are allowed.
5. **Annual revenue**: monetary amount or range with currency, with estimated status nested under the field when known.
6. **Company size**: employee-count range, with lower and upper bounds when useful.
7. **Company type**: one controlled value.
8. **Description**: concise free text describing what the company does.
9. **Domain**: normalized hostname without a protocol, path, or `www` prefix.
10. **Employees**: non-negative integer count, with estimated status nested under this field instead of changing its label.
11. **Location**: one or more structured locations supporting city, country, country code, headquarters status, postal code, region, and state or province.
12. **Products and services**: free-form offering concepts that do not duplicate the description.
13. **Tech stack**: separate `Categories`, `Products`, and `Vendors` lists.

`ORG.md` records sourced organization facts. `ICP.md` records desired or accepted account criteria, so numeric and monetary values may be target ranges and lists may contain accepted values. Research each field when safe sources are available. Keep unresolved fields visible as `Unknown`, preserve uncertainty and source limits, and never invent a value. Optional structural metadata or free-form notes may follow the 13 fields, but they are not default research targets.

## Changes

- Work only on `main`.
- Preview durable changes in chat and write them only after acceptance.
- Commit each accepted artifact. Git history is the undo mechanism.
- Persist accepted changes with the durable-write mechanism your environment declares; otherwise, if a remote exists, pull with rebase and push. Never force-push, and never report an unsaved change as saved.
- Explain folder changes, saved history, and private sharing in plain language. Keep branch, remote, upstream, and command details internal unless a problem requires them or the user asks.
