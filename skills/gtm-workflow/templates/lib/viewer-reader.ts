import { getWorld } from "workflow/runtime";
import { db } from "./db";
import { tables } from "./tables";
import { readData, type WorkflowData } from "./data-api";
import { effectivePolicy } from "./viewer-policy";
import { ViewerError, grants } from "./viewer-grants";
import { deploymentScope } from "./viewer-access";
import { runDestination } from "./viewer-destinations";
import type { Display, DataPolicy, View } from "./viewer-contract";
import registryJson from "#viewer-registry";
export type Entry = Display & {
  data: WorkflowData | null;
  sharePolicy: DataPolicy | null;
};
export const registry = registryJson as Entry[];
export const entryFor = (id: string) => {
  const entry = registry.find((e) => e.id === id || e.slug === id);
  if (!entry) throw new ViewerError(404, "not_found", "Workflow not found.");
  return entry;
};
export const currentPolicy = (entry: Entry) => effectivePolicy(entry, tables);
export async function authorizeShare(entry: Entry, token: string, view?: View) {
  return grants(db(), {
    ...deploymentScope(),
    workflowId: entry.id,
  }).authorize(token, view, currentPolicy(entry));
}
const safeRun = (r: any) => ({
  id: r.runId,
  status: r.status,
  createdAt: r.createdAt,
  startedAt: r.startedAt,
  completedAt: r.completedAt,
  deploymentId: r.deploymentId,
});
function ownsRun(entry: Entry, run: any, shared: boolean) {
  const scope = deploymentScope();
  if (
    shared &&
    (run.attributes?.["gtm.viewer.workspace"] !== scope.workspace ||
      run.attributes?.["gtm.viewer.environment"] !== scope.environment)
  )
    throw new ViewerError(
      404,
      "run_not_found",
      "Run not found in this environment.",
    );
  if (
    run.attributes?.["gtm.viewer.workspace"] &&
    run.attributes["gtm.viewer.workspace"] !== scope.workspace
  )
    throw new ViewerError(
      404,
      "run_not_found",
      "Run not found in this workspace.",
    );
  if (
    run.attributes?.["gtm.viewer.environment"] &&
    run.attributes["gtm.viewer.environment"] !== scope.environment
  )
    throw new ViewerError(
      404,
      "run_not_found",
      "Run not found in this environment.",
    );
  if (
    run.workflowName !== entry.workflowName ||
    (shared && run.attributes?.["gtm.viewer.id"] !== entry.id) ||
    (run.attributes?.["gtm.viewer.id"] &&
      run.attributes["gtm.viewer.id"] !== entry.id)
  )
    throw new ViewerError(
      404,
      "run_not_found",
      "Run not found in this workflow.",
    );
}
export async function readRuns(entry: Entry, url: URL, shared = false) {
  const world = await getWorld();
  const cursor = url.searchParams.get("cursor") ?? undefined;
  if (cursor && cursor.length > 512)
    throw new ViewerError(400, "invalid_cursor", "Invalid cursor.");
  const period = url.searchParams.get("period") ?? "all";
  const periods: Record<string, number> = {
    all: 0,
    day: 86400000,
    week: 604800000,
    month: 2592000000,
  };
  if (!(period in periods))
    throw new ViewerError(400, "invalid_period", "Invalid time filter.");
  const since = periods[period] ? Date.now() - periods[period] : 0;
  const status = url.searchParams.get("status") ?? undefined;
  if (
    status &&
    !["pending", "running", "completed", "failed", "cancelled"].includes(status)
  )
    throw new ViewerError(400, "invalid_status", "Invalid status.");
  let next = cursor;
  const data = [];
  let hasMore = false;
  for (let scanned = 0; scanned < 8; scanned++) {
    const page = await world.runs.list({
      workflowName: entry.workflowName,
      status: status as any,
      resolveData: "none",
      pagination: {
        limit: url.searchParams.get("latest") === "1" ? 1 : 25,
        cursor: next,
        sortOrder: "desc",
      },
    });
    data.push(
      ...page.data
        .filter((r) => {
          try {
            ownsRun(entry, r, shared);
            return (
              new Date(r.createdAt).getTime() >= since &&
              !r.attributes?.["gtm.viewer.parent"]
            );
          } catch {
            return false;
          }
        })
        .map((r) => ({
          ...safeRun(r),
          ...(!shared ? { destination: runDestination(r.runId) } : {}),
        })),
    );
    hasMore = Boolean(page.hasMore);
    if (hasMore && (!page.cursor || page.cursor === next))
      throw new ViewerError(
        503,
        "history_unavailable",
        "Run history pagination is unavailable.",
      );
    next = page.cursor ?? undefined;
    if (data.length || !hasMore) break;
  }
  return { data, cursor: next, hasMore };
}
export async function readBusinessData(entry: Entry, url: URL, shared = false) {
  if (!entry.data)
    return { unavailable: "No business data is registered for this workflow." };
  const config = structuredClone(entry.data);
  if (shared) {
    if (!currentPolicy(entry))
      throw new ViewerError(
        403,
        "data_unavailable",
        "Data sharing is not configured.",
      );
    for (const table of config.tables) {
      const p = entry.sharePolicy!.tables.find((t) => t.name === table.name)!;
      (table as any).row = p.row;
      table.columns = table.columns.filter((c) => p.columns.includes(c));
      table.defaultColumns = table.defaultColumns?.filter((c) =>
        p.columns.includes(c),
      );
      table.searchableColumns = table.searchableColumns?.filter((c) =>
        p.columns.includes(c),
      );
      table.nested = p.nested;
    }
    (config as any).rowPolicies = Object.fromEntries(
      entry.sharePolicy!.tables.map((t) => [t.name, t.row]),
    );
  }
  return readData(config, tables, db(), url);
}
