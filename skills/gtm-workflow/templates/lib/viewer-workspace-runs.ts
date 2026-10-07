import type { Display } from "./viewer-contract";
import { ViewerError } from "./viewer-grants";
import { runDestination } from "./viewer-destinations";

type Scope = { workspace: string; environment: string };
type Run = {
  runId: string; workflowName: string; status: string;
  createdAt: string | Date; startedAt?: string | Date; completedAt?: string | Date;
  deploymentId?: string; attributes?: Record<string, unknown>;
};
type Page = { data: Run[]; cursor?: string | null; hasMore?: boolean };
type List = (options: {
  status?: any; resolveData: "none";
  pagination: { limit: number; cursor?: string; sortOrder: "desc" };
}) => Promise<Page>;

/** Stable IDs survive a rename. Legacy names are accepted only when unambiguous; contradictory scope never is. */
export function workspaceRunWorkflow(entries: Display[], scope: Scope, run: Run) {
  const a = run.attributes ?? {};
  if ((a["gtm.viewer.workspace"] != null && a["gtm.viewer.workspace"] !== scope.workspace) ||
      (a["gtm.viewer.environment"] != null && a["gtm.viewer.environment"] !== scope.environment) ||
      a["gtm.viewer.parent"]) return undefined;
  if (a["gtm.viewer.id"] != null)
    return entries.find((entry) => entry.id === a["gtm.viewer.id"]);
  const matches = entries.filter((entry) => entry.workflowName === run.workflowName);
  return matches.length === 1 ? matches[0] : undefined;
}

/** Owner-only metadata read. The handler must enforce private access and reject share/preview callers. */
export async function workspaceRuns(list: List, entries: Display[], scope: Scope, url: URL, now = Date.now()) {
  const p = url.searchParams;
  const cursor = p.get("cursor") ?? undefined;
  if (cursor && cursor.length > 512)
    throw new ViewerError(400, "invalid_cursor", "Invalid cursor.");
  const periods: Record<string, number> = { all: 0, day: 86400000, week: 604800000, month: 2592000000 };
  const period = p.get("period") ?? "all";
  if (!Object.hasOwn(periods, period))
    throw new ViewerError(400, "invalid_period", "Invalid time filter.");
  const status = p.get("status") || undefined;
  if (status && !["pending", "running", "completed", "failed", "cancelled"].includes(status))
    throw new ViewerError(400, "invalid_status", "Invalid status.");
  const workflowId = p.get("runsWorkflow") || undefined;
  if (workflowId && !entries.some((e) => e.id === workflowId))
    throw new ViewerError(400, "invalid_workflow", "Invalid workflow filter.");
  const search = (p.get("q") ?? "").trim().toLowerCase();
  if (search.length > 200)
    throw new ViewerError(400, "invalid_search", "Search must be at most 200 characters.");
  const since = periods[period] ? now - periods[period] : 0;
  let next = cursor, hasMore = false;
  const data = [];
  // Bounded scanning, including sparse pages from other environments or removed workflows.
  for (let scanned = 0; scanned < 8; scanned++) {
    const page = await list({ status, resolveData: "none", pagination: { limit: 25, cursor: next, sortOrder: "desc" } });
    for (const run of page.data) {
      const entry = workspaceRunWorkflow(entries, scope, run);
      if (!entry || (workflowId && entry.id !== workflowId) ||
          !(new Date(run.createdAt).getTime() >= since) ||
          (search && ![run.runId, entry.title, entry.slug, run.status].some((v) => v.toLowerCase().includes(search)))) continue;
      data.push({
        id: run.runId, status: run.status, createdAt: run.createdAt,
        startedAt: run.startedAt, completedAt: run.completedAt, deploymentId: run.deploymentId,
        workflow: { id: entry.id, slug: entry.slug, title: entry.title },
        destination: runDestination(run.runId),
      });
    }
    hasMore = Boolean(page.hasMore);
    if (hasMore && (!page.cursor || page.cursor === next))
      throw new ViewerError(503, "history_unavailable", "Run history pagination is unavailable.");
    next = page.cursor ?? undefined;
    if (data.length || !hasMore) break;
  }
  return {
    data, cursor: next, hasMore,
    workflows: entries.map(({ id, title }) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title)),
  };
}
