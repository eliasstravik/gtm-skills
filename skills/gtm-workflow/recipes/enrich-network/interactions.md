# Example interactions

These are illustrative outcomes. Structured choices use native controls; open text and file requests use normal conversation replies, one at a time. Prices come from inspected services and are stated before execution; the examples prescribe no vendor or price.

## CSV, services not yet selected

**User:** Enrich my network.

**Agent:** Where should the connections or followers come from?

Options: CSV; existing database or table; service that retrieves the list.

**User:** CSV.

**Agent:** Which services should enrich the people and companies?

Options: use suitable connected services; Name the services; Find suitable services.

**User:** Use suitable connected services.

**Agent:** Upload the CSV of connections or followers. Include a LinkedIn profile URL, email, or provider ID where available; names alone may remain unresolved.

**User:** Attaches connections.csv through the normal upload flow.

The file request has no action button. The normal attachment continues the same conversation. The agent inspects the CSV and connected capabilities, presents real compatible choices with their coverage and prices when a choice is needed, then builds through `gtm-workflow`. It does not assume the first connected service can enrich both people and companies.

**Agent:** Building the network workflow with shared people and companies and all confirmed current roles. Keeping the imported list for future runs.

After verification, the save carries the dependency's diagram, runs, and data links.

**User:** Test one person.

**Agent:** Running one person and their identified current employers within the stated test budget.

**Agent:** Done: one person, two companies, three employment links. Two roles share the same company, so it was enriched once. Total cost: the recorded amount.

## Existing table and separate services

**User:** Use our followers table, our person enrichment service, and our company enrichment service. Three current roles maximum.

The agent reuses all supplied decisions, checks identifiers, service schemas/prices, and workflow credentials, and asks only if the table or named service is ambiguous. It builds without repeating source/provider questions.

**User:** Show everyone connected to Acme.

**Agent:** Acme has 12 people from this workflow. Open its company record to see them and their roles.

The agent reads actual linked data before giving the count.

## Retrieval, then a partial failure

**User:** Build a workflow that retrieves my followers and enriches them and their employers.

**Agent:** Which account and platform should the followers come from?

After the answer, the agent checks available retrieval capabilities, then asks the neutral enrichment-service question if still unanswered. It states any retrieval minimum charge before offering a test; it does not substitute connections for followers.

**User:** Test one person.

**Agent:** Done: one person enriched. One company enriched; another company lookup failed. The person's profile and both links are saved. Total cost: the recorded amount.

**User:** Retry the failed company.

The agent uses `gtm-workflow` to run the pending company work with its stated cost. It reuses the person enrichment and the successful company.
