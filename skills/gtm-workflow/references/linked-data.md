# Linked workflow data

The runtime has a read-only, paginated viewer at `/gtm/<slug>/data`. Enable it with a `data` property on the workflow's registry entry. Workflows without that property keep the existing database data link.

The `data` property is configuration, not a workflow stage. Import `WorkflowData` as a type from `lib/data-api.ts`; route-only code must not be imported as executable code into a workflow. Table names and column names below are Drizzle registry/property names. Supply actual names from the generated schema.

```ts
import type { WorkflowData } from "../lib/data-api";

// Inside workflows/index.ts, on the user-facing workflow entry alongside run/defaultInput:
data: {
  tables: [
    { name: "networkPeople", label: "People", labelColumn: "full_name",
      columns: ["key", "full_name", "profile_url", "status", "enriched_at"] },
    { name: "networkCompanies", label: "Companies", labelColumn: "name",
      columns: ["key", "name", "domain", "status", "enriched_at"] },
  ],
  relations: [
    { from: "networkPeople", to: "networkCompanies", through: "networkEmployment",
      fromColumn: "person_key", toColumn: "company_key" },
  ],
} satisfies WorkflowData,
```

Each visible table has a string `key`. The link table holds foreign keys to those keys. The viewer adds a related-record count to both tables: click a person's Companies count to see those companies, or a company's People count to see those people. Duplicate role links count a related entity once. Results paginate at 25 rows, including the related-record list. Clicking a name opens that record; tabs and Show all return to the full table. Register an Employment view separately when users need role-level browsing.

Only explicitly listed columns are displayed. Leave raw responses, traces, credentials, and source payloads out of the view. Table access is limited to this workflow's configured views and relationship tables; URL values are SQL parameters, never SQL identifiers. Declaring a table in another workflow's registry entry does not expose it here.

`GET /api/link/<slug>` returns the signed viewer URL as `dataUrl` when a view is configured. The data token lasts seven days and is scoped to `data:<slug>`, separately from the diagram token. Anyone with the data link can read the configured data until it expires; share it only with the intended audience. Pages do not cache or send the token to external resources. The usual bearer credential protects the link-issuing route. Local pages use the runtime's local-access convention.

Preserve `data` and `intake` metadata when adding, updating, or regenerating registry entries during runtime upgrades. A schema rename needs the matching view update. Install this runtime before registering a data view; verify both relationship directions with fixture rows and check that diagram tokens and other workflows' data tokens are refused.
