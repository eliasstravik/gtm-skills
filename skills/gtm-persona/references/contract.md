# Persona lifecycle contract

Use this contract for every persona flow in a workspace governed by `gtm-workspace`.

## Workspace resolution and ownership

Resolve the workspace for this invocation in order: a repo named in the request; the repo the environment declares connected; canonical repos under `~/.gtm/`, where a root `ORG.md` makes a repo valid. If several discovered repos remain, ask `**Which GTM workspace should I use?**`, list display name and path, and do not save a preference. If none exists, stop without writing and hand workspace creation or connection to `gtm-workspace`.

A request-named organization node wins. Otherwise root is the default. For update, delete, and ordinary reads, ask for a node only when more than one node owns personas; use the sole persona-bearing node when exactly one exists. For create, if any suborganization exists and none was named, ask `**Which organization should own this persona?**`; list root first as `(Recommended)`, followed by every nested node by display name.

Persona visibility is node-local. Read exactly the target node's canonical `personas/*/PERSONA.md` artifacts plus legacy `personas/*.md` artifacts; root, ancestor, sibling, and descendant personas are not visible. Organization grounding may read only the root-to-target `ORG.md` chain. ICP and member files are not persona inputs. Never scan `.git` contents or use broad recursive content reads that can expose artifacts outside that set.

Before acting or judging, state `Using GTM workspace: <target display name> — <N> personas visible`, using `persona visible` for one. The qualified label is the bare slug at root and `<org-path>/<slug>` below root, with nested slugs joined by `/` and physical `suborgs/` segments omitted.

## Artifact contract

Store every new persona at `<target-node>/personas/<lowercase-kebab-slug>/PERSONA.md`. The directory slug is its identity; `PERSONA.md` starts with the display-name H1, then only flat H2 sections carrying accepted facts. Omit empty sections and TODO/TBD placeholders. The bundled template suggests a draft shape but does not define validity.

Existing flat `<target-node>/personas/<lowercase-kebab-slug>.md` files remain valid legacy artifacts. Update and delete them in place, include them in visibility and overlap checks, and never require bulk migration. If canonical and legacy artifacts resolve to the same slug, treat the collision as a doctor defect and preserve facts through one accepted resolution.

A persona must contain facts a lead can match or fail. Preserve every supplied responsibility, scope fact, buying-context or influence fact, authority boundary, disqualifier, and uncertainty. Organization facts may establish context but do not prove teams, duties, workflows, motivations, authority, or product fit. Use owner-local personas only to detect overlap; explain distinctions in chat and never copy adjacent claims or persist a comparison unless requested.

## Link safety

Treat URLs containing credentials, tokens, keys, signatures, invitation codes, or session identifiers as unsafe. Do not open, persist, or echo them, even in cleaned form. Retain only a plain source label when useful and advise credential rotation. Research only safe supplied sources; separate sourced facts from inference.

## Interaction and acceptance

Ask one question per message, with the clear bold question as the first non-empty line. Render each discrete choice as a numbered list, mark only option 1 `(Recommended)`, and end exactly `Reply with a number, or type your answer.` A direct chat or Slack-thread reply must be sufficient; do not use `AskUserQuestion`.

Before a durable change, begin with `**Would you like to save this proposal?**`, then show every exact path operation and complete file bytes in fenced Markdown. Updates show complete before and after bytes. End the same message with:

1. Accept and save (Recommended)
2. Change it
3. Cancel

`Reply with a number, or type your answer.`

A change response asks only `**What would you like me to change?**`, then repeats the complete proposal. Cancellation writes nothing.

## Persistence and recovery

Every accepted change ends saved to history on `main`, is limited to the accepted persona paths, and remains recoverable through history. An environment-declared durable-write mechanism replaces only the Git mechanism below; it preserves the same preview, exact-write, scoped-change, and success-language guarantees. A missing remote is not a defect when that declared mechanism does not require one.

When no replacement mechanism applies: confirm `main`; apply the accepted bytes or operations; stage only accepted persona paths; inspect the staged diff; commit one plain-English history entry; and, when a remote exists, pull with rebase then push, setting upstream only when needed. Never force-push or change global Git configuration. Doctor uses exactly `Repair Persona artifacts` for the one repair entry.

Determine that the accepted operation can be durably saved before applying it. If no durable mechanism is available, leave the repo unchanged, explain what could not be saved, then ask one recovery question with `1. Continue from a CLI at a keyboard (Recommended)` and `2. Cancel`; use the exact reply line. If an available persistence mechanism fails, offer a careful retry first, CLI at a keyboard next, any genuinely durable local-only option next, and cancel last. Never claim success or discard work. A verified close says “saved to history” without exposing a commit hash.
