import type { Display, RegistryGroup } from "./viewer-contract";
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
  workflowName?: string; status?: any; resolveData: "none";
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

/**
 * A run another run started: a stage (one workflow starting another, carrying only `gtm.viewer.parent`) or a fan-out
 * part (a workflow starting itself, carrying its parent's viewer attributes). Either way the run's own workflow name
 * says which workflow it is; the name must match exactly one registered workflow.
 */
export function stageRunWorkflow(entries: Display[], scope: Scope, run: Run) {
  const a = run.attributes ?? {};
  if (!a["gtm.viewer.parent"] ||
      (a["gtm.viewer.workspace"] != null && a["gtm.viewer.workspace"] !== scope.workspace) ||
      (a["gtm.viewer.environment"] != null && a["gtm.viewer.environment"] !== scope.environment)) return undefined;
  const matches = entries.filter((entry) => entry.workflowName === run.workflowName);
  return matches.length === 1 ? matches[0] : undefined;
}

/** Puts each started run directly under the run that started it when both are on the page, in start order. */
export function nestStages<T extends { id: string; parent?: string; createdAt: string | Date }>(runs: T[]): T[] {
  const ids = new Set(runs.map((r) => r.id)), children = new Map<string, T[]>();
  for (const run of runs)
    if (run.parent && ids.has(run.parent)) children.set(run.parent, [...(children.get(run.parent) ?? []), run]);
  const result: T[] = [];
  const add = (run: T, depth: number) => {
    result.push(run);
    if (depth > 8) return;
    for (const child of (children.get(run.id) ?? []).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()))
      add(child, depth + 1);
  };
  for (const run of runs) if (!run.parent || !ids.has(run.parent)) add(run, 0);
  return result;
}

/**
 * Owner-only metadata read. The handler must enforce private access and reject share/preview callers. With a group,
 * only the group's workflows are listed, and runs they started as stages are included under their parents.
 */
export async function workspaceRuns(list: List, entries: Display[], scope: Scope, url: URL, now = Date.now(), group?: RegistryGroup) {
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
  const members = group ? entries.filter((e) => group.workflows.includes(e.id)) : entries;
  const workflowId = p.get("runsWorkflow") || undefined;
  if (workflowId && !members.some((e) => e.id === workflowId))
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
      const entry = workspaceRunWorkflow(entries, scope, run) ?? (group ? stageRunWorkflow(entries, scope, run) : undefined);
      if (!entry || !members.includes(entry) || (workflowId && entry.id !== workflowId) ||
          !(new Date(run.createdAt).getTime() >= since) ||
          (search && ![run.runId, entry.title, entry.slug, run.status].some((v) => v.toLowerCase().includes(search)))) continue;
      data.push({
        id: run.runId, status: run.status, createdAt: run.createdAt,
        startedAt: run.startedAt, completedAt: run.completedAt, deploymentId: run.deploymentId,
        workflow: { id: entry.id, slug: entry.slug, title: entry.title },
        ...(run.attributes?.["gtm.viewer.parent"] ? { parent: String(run.attributes["gtm.viewer.parent"]) } : {}),
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
    data: group ? nestStages(data) : data, cursor: next, hasMore,
    workflows: members.map(({ id, title }) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title)),
  };
}

export type LastRun = {
  id: string; status: string; createdAt: string | Date; startedAt?: string | Date; completedAt?: string | Date;
  /** Started by another workflow as one of its stages. */
  stage?: boolean;
  /** The statuses of its newest runs on the page read, newest first, this one included: the row's run history strip. */
  recent: string[];
};
/** How many runs the Workflows page's history strip shows. */
export const RECENT_RUNS = 10;
/**
 * The newest runs of each workflow: one read per workflow, by its own workflow name, so a busy workflow never hides
 * another's last run. A run it made as another workflow's stage counts; the parts a fan-out splits into do not (their
 * parent is the run). `null` means no run; `"unknown"` that the newest runs of that name are all elsewhere (another
 * environment, or fan-out parts) and older history was not read.
 */
export async function lastRuns(list: List, entries: Display[], scope: Scope, concurrency = 6) {
  const result: Record<string, LastRun | null | "unknown"> = {};
  const queue = [...entries];
  const worker = async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      const page = await list({ workflowName: entry.workflowName, resolveData: "none", pagination: { limit: 50, sortOrder: "desc" } });
      const own = page.data.filter((r) => {
        if (workspaceRunWorkflow(entries, scope, r)?.id === entry.id) return true;
        // A stage run carries no viewer ID of its own, or its parent's; a fan-out part carries its own workflow's.
        return stageRunWorkflow(entries, scope, r)?.id === entry.id && r.attributes?.["gtm.viewer.id"] !== entry.id;
      });
      const run = own[0];
      result[entry.id] = run
        ? { id: run.runId, status: run.status, createdAt: run.createdAt, startedAt: run.startedAt, completedAt: run.completedAt,
            ...(run.attributes?.["gtm.viewer.parent"] ? { stage: true } : {}), recent: own.slice(0, RECENT_RUNS).map((r) => r.status) }
        : page.hasMore ? "unknown" : null;
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  return result;
}
