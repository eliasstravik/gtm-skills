# Recipe: enrich a network

## Trigger

Use this recipe when creating or changing a workflow that enriches connections or followers, with enriched people, their current companies, and links in both directions, for requests such as "enrich my network", "build a workflow for my followers", or "enrich these connections and their employers". Not for retrieving a list without enrichment, generic lead enrichment, or one-off prospect qualification. An existing workflow's run, schedule, deploy, upgrade, or deletion needs no recipe.

## Scope

This recipe specifies a network enrichment workflow. [gtm-workflow](../../SKILL.md) owns the generated code, database tables, runs, schedules, deployment, and shared guardrails. This recipe supplies the blueprint; it does not introduce another runtime or approval process.

## Inputs

The user's source of connections or followers; person and company enrichment capabilities; the workspace and run settings required by `gtm-workflow`. Follow [the recipe](recipe.md) for the data and execution contract.

## Roles

The user supplies or chooses the source and enrichment access. The agent inspects available capabilities, fills this recipe, and builds through `gtm-workflow`. `gtm-workflow` owns permission, cost, and run decisions, including authorization already given in the conversation.

## Procedure

1. Ask **"Where should the connections or followers come from?"** when the source is missing. Offer a CSV, an existing database/table, or a service that retrieves the list. A supplied source already answers the question. When CSV is selected but no file is attached, ask directly: "Upload the CSV of connections or followers. Include a LinkedIn profile URL, email, or provider ID where available; names alone may remain unresolved." Wait for a normal attachment, with no answer or upload button. Inspect its identifiers and access before choosing enrichment. For retrieval, establish whose network, which platform, and connections versus followers only when missing.
2. Ask **"Which services should enrich the people and companies?"** when no preference is supplied. Offer existing connected services, services the user names, or help finding suitable services. A direct provider and an aggregator are equally valid; each of source retrieval, person enrichment, and company enrichment may use a different service. Never put a particular vendor in the default question, examples, dependency list, or generated scaffold. Concrete provider names appear only after the user names them or discovery establishes real choices.
3. Inspect the chosen services' current documentation, accepted identifiers, current-employment fields, company identifiers, prices, pagination, and authentication. Discover endpoints at build time and use plain provider-call steps at run time when the sequence is known. An aggregator uses its own documented API and credentials. A connected tool in the conversational agent does not establish that the workflow project has the required credentials.
4. State the resolved behavior in one sentence: source, people and company enrichment, all confirmed current roles, shared People and Companies, and the run caps. Ask only for missing choices that change the result, one question at a time. Do not ask for an ICP or persona for enrichment alone. Use `gtm-workflow` for creation and its usual run decisions.
5. Build the [recipe](recipe.md): durable input, enriched people, deduplicated company enrichment, employment history on each person, and both browsing directions using `gtm-workflow`'s [linked data viewer](../../references/linked-data.md). Keep every returned role. Only confirmed current roles drive company enrichment.
6. Before a paid run, check the entire source → people → companies cost and credentials through `gtm-workflow`. A one-person test includes that person's selected current employers, within one shared budget. Validate with [the acceptance cases](acceptance.md), then report separate people/company outcomes and total spend.

## Outputs

A saved workflow using the workspace-wide People and Companies tables, a diagram, runs, and a Data view limited to that workflow's people and their current companies. Every returned role stays on its person. Pending companies and unresolved employers remain distinguishable.

## Exceptions

- A list containing names alone needs an identity-resolution step or better input before paid bulk enrichment. Do not merge people or companies by name alone.
- A source with no accessible export or retrieval capability needs the user's source choice. A request for followers does not authorize substituting connections or another audience.
- Unknown employment status is retained as unknown. A provider that exposes only one headline employer cannot support the full multi-experience recipe; explain its limit and offer capable alternatives or the user's explicit acceptance of reduced coverage.
- Building the workflow does not authorize retrieving a paid list or starting enrichment. Existing explicit run authorization is handled by `gtm-workflow` without asking again.

## QC

- The source was supplied or asked for; the provider question is neutral, and person/company services can differ.
- `gtm-workflow` was read and owns the lifecycle; the workflow does not require a scoring persona or ICP.
- Every returned role survives. Distinct confirmed current companies share one work list and budget; there is no role cap.
- One company shared by multiple people has one identity and one paid lookup per freshness period, including across chunks and overlapping runs.
- A failed company lookup can resume without re-enriching the person; failed refreshes preserve the last successful profile and relationships.
- Both browsing directions, source restartability, cost bounds, and the acceptance cases are verified before claiming the workflow works.

## References

[Recipe](recipe.md) for execution and data; [interactions](interactions.md) for user-facing examples; [acceptance](acceptance.md) for verification. Owned by [gtm-workflow](../../SKILL.md), including its workspace and interaction rules.
