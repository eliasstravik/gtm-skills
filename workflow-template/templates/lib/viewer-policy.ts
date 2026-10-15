import { getTableColumns, getTableName } from "drizzle-orm";
import { dataSharingIssue } from "./viewer-policy-validation.mjs";
import { ViewerError } from "./viewer-grants";
import type { DataPolicy } from "./viewer-contract";
import type { WorkflowData } from "./data-api";
export function effectivePolicy(
  entry: { data: WorkflowData | null; sharePolicy: DataPolicy | null },
  tables: Record<string, any>,
): DataPolicy | undefined {
  if (!entry.data || !entry.sharePolicy || dataSharingIssue(entry)) return;
  const policy = entry.sharePolicy;
  // Physical table/column mapping is part of authorization, as well as the authored registry.
  const physical = policy.tables.map((t) => {
    const table = (tables as Record<string, any>)[t.name];
    if (!table)
      throw new ViewerError(
        503,
        "data_configuration",
        "Data policy names an unknown table.",
      );
    const cols = getTableColumns(table);
    const view = entry.data!.tables.find((v) => v.name === t.name);
    const columns = [
      ...new Set([...(view?.columns ?? []), ...t.columns]),
    ].sort();
    return {
      ...t,
      name: t.name,
      columns: [
        ...columns.map((c) => `allowed:${c}`),
        ...Object.keys(cols)
          .sort()
          .map((c) => `${c}:${cols[c].name}`),
        `label:${view?.labelColumn ?? ""}`,
        `table:${getTableName(table)}`,
      ],
    };
  });
  return {
    ...policy,
    version: policy.version,
    tables: physical,
    relations: entry.data.relations ?? [],
  };
}
