# GTM workflow contract

Use this contract for every workflow flow in a workspace governed by `gtm-workspace`.

## Contents

- [Workspace resolution and node ownership](#workspace-resolution-and-node-ownership)
- [Node shape](#node-shape)
- [Registry contract](#registry-contract)
- [Workflow record contract](#workflow-record-contract)
- [Tracked and working state](#tracked-and-working-state)
- [Acceptance and target-side ordering](#acceptance-and-target-side-ordering)
- [Go-live and run gating](#go-live-and-run-gating)
- [Safety and persistence](#safety-and-persistence)

## Workspace resolution and node ownership

Resolve the workspace in order: a repo named in the request; the repo the environment declares connected; canonical repos under `~/.gtm/`, where root `ORG.md` makes a repo valid. If several remain, ask `**Which GTM workspace should I use?**`, list display name and path, and save no preference. If none exists, stop without writing and hand creation or connection to `gtm-workspace`.

A request-named organization node wins. Otherwise root is the default unless the requested workflow or registry is owned by exactly one other node. For create, if any suborganization exists and none was named, ask `**Which organization should own this workflow?**`, listing root first as `(Recommended)` and then every nested node by display name.

Workflow visibility and configuration are node-local. Read only the resolved node's `workflows/WORKFLOWS.md` and `workflows/*/WORKFLOW.md` records. A suborganization workflow binds to a target in that suborganization node's own registry, matching node-local ICP ownership; it never inherits a root or sibling target.

Before acting or judging, state `Using GTM workspace: <display name> — <N> workflows visible`, using `workflow visible` for one. A workflow's qualified label is the bare slug at root and `<org-path>/<slug>` below root, with nested organization slugs joined by `/` and physical `suborgs/` segments omitted.

## Node shape

```text
<organization-node>/
└── workflows/
    ├── WORKFLOWS.md
    └── <workflow-slug>/
        ├── WORKFLOW.md
        └── <tracked local-target implementation files, when applicable>
```

Every node with workflow artifacts has one registry. Every workflow, regardless of backend, has one record. Only local targets place implementation files beside the record. Target-side state is authoritative for external implementations and runs.

## Registry contract

`WORKFLOWS.md` begins with `# Workflows`, names exactly one default target when targets exist, and contains `## Targets`, `## Connections`, and `## Limits` as applicable. It is authored prose, not hidden machine state or a rigid data schema.

Each named target section answers the following internal operating questions. User-facing target choices follow `conversation.md` and do not expose this implementation detail by default.

- how the agent authors and updates there, including target-native validation;
- how it runs once, tests, or pilots;
- how it goes live, who can perform that action, and what draft versus live means;
- how the agent inspects workflow state and runs;
- where workflow definitions, data, and run state live;
- how billing works and how cost is estimated before a run; and
- how connections and credentials work there.

Use no target-kind field. Setup may describe a target as an app, infrastructure, or local, but behavior comes from the operating prose. Before saving a target, verify that an available CLI, MCP, API, or file surface lets the agent author, run, and inspect workflows. Record an invoke-only or data-only tool as a connection instead and explain why. One provider may be both a target and a connection.

Each connection section names the provider or API, says how the target uses it, points to the secret without containing it, notes whether credentials live in-app, and records a known billing or credit model. `## Limits` records accepted ceilings such as maximum rows, writes, credits, or pilot size. Every flow honors them.

Targets and connections use the same create, update, inspect, and delete lifecycle as workflows. Route first-time and “create a target” requests through setup. Before deleting a target, check every node-local record for bindings to it; do not leave dangling records.

## Workflow record contract

Store a new record at `workflows/<lowercase-kebab-slug>/WORKFLOW.md`. It contains:

- a display-name H1;
- one non-empty `Target:` line naming a registry target;
- one `Kind:` line with exactly `on-demand`, `scheduled`, or `triggered`;
- one target-native pointer line such as `Workflow ID:`, `URL:`, or `Repo path:`;
- factual prose for purpose, inputs and outputs, and operation.

The record is freeform beyond those required lines. It contains no run entries or history log. The target-native identifier is assigned before the record preview so accepted bytes are the cross-session map to the real artifact.

Every operation dereferences record → target name → target prose. Missing target prose is a health defect, not permission to improvise backend semantics.

## Tracked and working state

Authored records, registry prose, local scripts, schemas, tests, and fixtures are tracked content. Local-target SQLite databases, run outputs, caches, and logs are working state and remain gitignored. Runs never append to `WORKFLOW.md` or another tracked file.

When setup, quick-local materialization, or no-argument inspect creates a `workflows/` folder, include the applicable lines below in the accepted `.gitignore` bytes and avoid duplicates:

```gitignore
**/workflows/*/state.sqlite
**/workflows/*/state.sqlite-*
**/workflows/*/outputs/
**/workflows/*/runs/
**/workflows/*/.cache/
```

`gtm-workflow` owns checking and repairing these lines. `gtm-workspace` only tolerates them and validates the placement of `workflows/`.

## Acceptance and target-side ordering

Durable mutations are registry and record bytes, tracked local implementation bytes, anything live, published, or deployed on a target, and any externally visible write. A target's draft or scratch space is not durable; ordinary iterative construction there needs no byte-level gate.

Use this order for each mutation:

1. Agree the design in ordinary conversation.
2. Build or edit in target-native draft space and validate there.
3. Obtain target identifiers, inspect the complete actual registry or record bytes and every tracked local script, schema, test, or fixture byte internally, and validate the actual diff. Show the accurate behavior and affected-path proposal from `conversation.md`. On acceptance, write exactly the reviewed draft and save it to history.
4. Gate and perform go-live when the target has a draft/live divide or deployment is consequential.

Never leave a target-side artifact the agent created without its accepted record. If the user rejects or cancels after draft construction, offer to delete the abandoned draft. Record-only deletion is the explicit user-chosen exception for an existing workflow and must say that the target workflow remains active but is no longer tracked here.

For the acceptance turn, use the proposal fields and exact block in `conversation.md`. Do not print complete file bodies or diffs unless the user asks for technical detail. The concise summary must still expose every external write, permission, material limit, destructive effect, and durable path operation.

A change response asks only `**What would you like me to change?**`, updates and revalidates the internal draft, then repeats the concise proposal. Cancellation writes no tracked byte and invokes draft cleanup handling when applicable.

## Go-live and run gating

Create and update finish by following the target's go-live prose. Ask the user to perform and then verify any target action unavailable to the agent, such as clicking Publish. If deferred, state exactly what is draft and live, how to finish, and—on draft/publish targets—that the live version still runs the old logic. A bare publish, activate, or make-it-live request is update with no content changes; it may skip byte preview and go directly to the go-live gate.

Local targets support only on-demand workflows. Refuse scheduled or triggered creation there and name both alternatives: add an infrastructure or app target, or keep the workflow on-demand and have the user's scheduler invoke it on a cadence. Scheduling remains outside the local workflow. On local and push-deploy targets, go-live may be a no-op or part of the accepted build/deploy convention.

A direct request authorizes ordinary work. Before a run that writes externally or incurs material provider cost, preview records touched, writes and destination, estimated credits or cost, saved limits, and an optional target-native pilot on a few records. Use target-native estimation or free count/preview surfaces when available and proceed only after acceptance. Local and read-only runs are ungated. Report the business outcome first, followed by failures, external changes, saved results, and relevant cost; keep run data target-side or gitignored.

## Safety and persistence

Treat URLs containing credentials, tokens, keys, signatures, invitation codes, or session identifiers as unsafe. Do not open, persist, or echo them. Registry connection entries store only pointers such as an environment-variable name or keychain/1Password item. Advise rotation when a secret was exposed.

Every accepted tracked change ends saved to history on `main`, limited to accepted paths and recoverable through history. An environment-declared durable-write mechanism replaces only the Git mechanism; it preserves preview, exact-write, scoped-change, and success-language guarantees.

Without a replacement mechanism: confirm `main`; stage only accepted paths; inspect the staged diff; commit one plain-English history entry; and, when a remote exists, pull with rebase then push without force. Determine that persistence is available before applying accepted bytes. If it is unavailable, leave the workspace and any agent-created target draft unchanged or cleaned up, explain in plain language what could not be saved, and offer keyboard recovery before cancellation. A verified close says “saved to history” without exposing branch, remote, upstream, command, or commit details unless the user requests developer details or a problem requires them.
