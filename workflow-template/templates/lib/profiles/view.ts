import type { WorkflowData } from "../data-api";
import type { DataPolicy, RowPolicy } from "../viewer-contract";
import { peopleFields, companiesFields } from "./schema";

/** Persistent workflow UUIDs, never slugs or display names, select each population. */
export function profileView(workflowId: string): {
  data: WorkflowData;
  sharePolicy: DataPolicy;
} {
  const peopleRow: RowPolicy = {
    version: "shared-profiles-v1",
    membership: { column: "sources_json", workflowId },
  };
  const companyRow: RowPolicy = {
    version: "shared-profiles-v1",
    currentCompanies: { peopleTable: "people", workflowId },
  };
  const personDefaults = [
    "full_name",
    "linkedin_url",
    "headline",
    "location_label",
    "experiences_json",
    "followers_count",
    "enriched_at",
    "enrichment_status",
  ];
  const companyDefaults = [
    "name",
    "domain",
    "description",
    "industries_json",
    "company_size_label",
    "linkedin_employee_count",
    "headquarters_label",
    "enriched_at",
    "enrichment_status",
  ];
  const fields = (dictionary: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(dictionary).map(([name, type]) => [
        name,
        {
          label: name.replace(/_json$/, "").replaceAll("_", " "),
          type: (type.startsWith("JSON")
            ? "json"
            : type === "BOOL"
              ? "boolean"
              : ["REAL", "INTEGER"].includes(type)
                ? "number"
                : name.endsWith("_url")
                  ? "url"
                  : name.endsWith("_at")
                    ? "date"
                    : "text") as
            | "json"
            | "boolean"
            | "number"
            | "url"
            | "date"
            | "text",
        },
      ]),
    );
  const relations = [
    {
      from: "people",
      to: "companies",
      through: "people",
      fromColumn: "key",
      toColumn: "experiences_json",
      reference: "current-experiences-v1" as const,
    },
  ];
  return {
    data: {
      rowPolicies: { people: peopleRow, companies: companyRow },
      tables: [
        {
          name: "people",
          label: "People",
          labelColumn: "full_name",
          columns: Object.keys(peopleFields),
          defaultColumns: personDefaults,
          searchableColumns: [
            "full_name",
            "headline",
            "location_label",
            "linkedin_url",
          ],
          fields: fields(peopleFields),
        },
        {
          name: "companies",
          label: "Companies",
          labelColumn: "name",
          columns: Object.keys(companiesFields),
          defaultColumns: companyDefaults,
          searchableColumns: [
            "name",
            "domain",
            "description",
            "headquarters_label",
          ],
          fields: fields(companiesFields),
        },
      ],
      relations,
    },
    sharePolicy: {
      version: "2",
      relations,
      tables: [
        {
          id: "shared-people-v1",
          name: "people",
          columns: ["key", ...personDefaults],
          row: peopleRow,
          nested: {
            experiences_json: [
              "experience_key",
              "company_key",
              "company_name",
              "company_linkedin_url",
              "title",
              "start_date",
              "end_date",
              "current_status",
            ],
          },
        },
        {
          id: "shared-companies-v1",
          name: "companies",
          columns: ["key", ...companyDefaults],
          row: companyRow,
          nested: { industries_json: ["$value", "name", "id", "namespace"] },
        },
      ],
    },
  };
}
