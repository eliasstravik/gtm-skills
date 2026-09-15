import { mapSteps } from "./viewer-mapping";
import { getWorld } from "workflow/runtime";
import {
  deriveRunPayloadKeys,
  hydrateStepArguments,
  hydrateStepReturnValue,
  hydrateWorkflowArguments,
  hydrateWorkflowReturnValue,
  hydrateRunError,
  hydrateStepError,
} from "@workflow/core/serialization";
import { rawClient } from "./db";
import { tables } from "../db/tables";
import { readData, readCounts, type WorkflowData } from "./data-api";
import { effectivePolicy } from "./viewer-policy";
import { listChildren } from "./runs-api";
import { ViewerError, grants } from "./viewer-grants";
import { deploymentScope } from "./viewer-access";
import type { Display, DataPolicy, View } from "./viewer-contract";
import registryJson from "#viewer-registry";
import { summarizeRun } from "./viewer-summary";
const summaries = new Map<
  string,
  { until: number; value: Awaited<ReturnType<typeof summarizeRun>> }
>();
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
  const client = rawClient();
  try {
    return await grants(client, {
      ...deploymentScope(),
      workflowId: entry.id,
    }).authorize(token, view, currentPolicy(entry));
  } finally {
    client.close();
  }
}
const safeRun = (r: any) => ({
  id: r.runId,
  status: r.status,
  createdAt: r.createdAt,
  startedAt: r.startedAt,
  completedAt: r.completedAt,
  deploymentId: r.deploymentId,
  attributes: r.attributes,
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
function payload(value: unknown) {
  const seen = new WeakSet();
  const json = JSON.stringify(value, (_key, v) => {
    if (typeof v === "bigint") return String(v);
    if (v instanceof Error) return { name: v.name, message: v.message };
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
      if (v instanceof ReadableStream) return "[Stream unavailable]";
    }
    return v;
  });
  if (json === undefined) return { state: "unavailable" };
  if (json.length > 16384)
    return { state: "truncated", value: json.slice(0, 16384) };
  return { state: "available", value: JSON.parse(json) };
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
  const page = await world.runs.list({
    workflowName: entry.workflowName,
    status: status as any,
    resolveData: "none",
    pagination: {
      limit: url.searchParams.get("latest") === "1" ? 1 : 25,
      cursor,
      sortOrder: "desc",
    },
  });
  const data = page.data
    .filter((r) => {
      try {
        ownsRun(entry, r, shared);
        return (
          new Date(r.createdAt).getTime() >= since &&
          (url.searchParams.get("children") === "1" ||
            !r.attributes?.["gtm.viewer.parent"])
        );
      } catch {
        return false;
      }
    })
    .map((r) =>
      shared ? { ...safeRun(r), attributes: undefined } : safeRun(r),
    );
  return { ...page, data };
}
export async function readRun(entry: Entry, url: URL, shared = false) {
  const id = url.searchParams.get("run") ?? "";
  if (!/^wrun_[A-Za-z0-9]{26}$/.test(id))
    throw new ViewerError(400, "invalid_run", "Invalid run.");
  const world = await getWorld();
  const meta = await world.runs.get(id, { resolveData: "none" });
  ownsRun(entry, meta, shared); // Before fetching retained payloads or requesting a decryption key.
  if (url.searchParams.get("op") === "events") {
    const cursor = url.searchParams.get("eventCursor") ?? undefined;
    if (cursor && cursor.length > 512)
      throw new ViewerError(400, "invalid_cursor", "Invalid event cursor.");
    const events = await world.events.list({
      runId: id,
      resolveData: "none",
      pagination: { limit: 50, cursor, sortOrder: "asc" },
    });
    return {
      events: events.data.map((e) => ({
        id: e.eventId,
        type: e.eventType,
        invocation: e.correlationId,
        createdAt: e.createdAt,
        attempt:
          e.eventType === "step_started" ? e.eventData?.attempt : undefined,
      })),
      cursor: events.cursor,
      hasMore: events.hasMore,
    };
  }
  const parentId = meta.attributes?.["gtm.viewer.parent"];
  if (parentId) {
    const parent = await world.runs.get(parentId, { resolveData: "none" });
    ownsRun(entry, parent, shared);
    if (!(await listChildren(parentId)).includes(id))
      throw new ViewerError(
        404,
        "run_not_found",
        "Child run lineage unavailable.",
      );
  }
  const cacheKey = `${deploymentScope().workspace}:${deploymentScope().environment}:${entry.id}:${id}:${meta.status}`;
  const cached = summaries.get(cacheKey);
  const summary =
    cached && cached.until > Date.now()
      ? cached.value
      : await summarizeRun((cursor) =>
          world.steps.list({
            runId: id,
            resolveData: "none",
            pagination: { limit: 100, cursor, sortOrder: "asc" },
          }),
        );
  if (summaries.size > 500) summaries.clear();
  summaries.set(cacheKey, {
    until:
      Date.now() +
      (["completed", "failed", "cancelled"].includes(meta.status)
        ? 60000
        : 3000),
    value: summary,
  });
  const childIds = await listChildren(id);
  const children = [];
  for (const childId of childIds.slice(0, 100)) {
    try {
      const child = await world.runs.get(childId, { resolveData: "none" });
      ownsRun(entry, child, shared);
      children.push({ id: child.runId, status: child.status });
    } catch {
      /* Missing or out-of-scope children remain unavailable. */
    }
  }
  const cursor = url.searchParams.get("cursor") ?? undefined;
  if (cursor && cursor.length > 512)
    throw new ViewerError(400, "invalid_cursor", "Invalid cursor.");
  const steps = await world.steps.list({
    runId: id,
    pagination: { limit: 25, cursor, sortOrder: "asc" },
  });
  // Public runs never hydrate or return arbitrary business payloads, even with Data scope.
  // Business records are read through the versioned table policy instead.
  if (shared)
    return {
      run: { ...safeRun(meta), attributes: undefined },
      steps: steps.data.map((s) => ({
        id: s.stepId,
        name: s.stepName,
        label: stepLabel(entry, s.stepName),
        status: s.status,
        attempt: s.attempt,
        createdAt: s.createdAt,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        errorSummary:
          s.status === "failed"
            ? "Step failed. Ask the workflow owner for details."
            : undefined,
      })),
      cursor: steps.cursor,
      hasMore: steps.hasMore,
      summary,
      children,
      childrenComplete: childIds.length <= 100,
      overlay: "unavailable",
      overlayReason: "Historical diagram unavailable in this shared trace.",
    };
  const run = await world.runs.get(id);
  let key: Awaited<ReturnType<typeof deriveRunPayloadKeys>> | undefined;
  let locked = false;
  try {
    const raw = await world.getEncryptionKeyForRun?.(run);
    key = raw ? await deriveRunPayloadKeys(raw) : undefined;
  } catch {
    locked = true;
  }
  const decode = async (fn: Function, value: unknown) => {
    if (value instanceof Uint8Array && value.byteLength > 1048576)
      return { state: "truncated", value: "Saved payload exceeds 1 MB." };
    if (locked) return { state: "locked" };
    if (value === undefined) return { state: "unavailable" };
    try {
      return payload(await fn(value, id, key));
    } catch {
      return { state: "unavailable" };
    }
  };
  const [input, output, error, detail] = await Promise.all([
    decode(hydrateWorkflowArguments, run.input),
    decode(hydrateWorkflowReturnValue, run.output),
    decode(hydrateRunError, run.error),
    Promise.all(
      steps.data.map(async (s) => ({
        id: s.stepId,
        name: s.stepName,
        label: stepLabel(entry, s.stepName),
        status: s.status,
        attempt: s.attempt,
        createdAt: s.createdAt,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        input: await decode(hydrateStepArguments, s.input),
        output: await decode(hydrateStepReturnValue, s.output),
        error: await decode(hydrateStepError, s.error),
      })),
    ),
  ]);
  const scope = deploymentScope();
  const client = rawClient();
  let artifact: Entry | undefined;
  try {
    const rows = await client.execute({
      sql: "SELECT display FROM gtm_viewer_graphs WHERE workspace = ? AND environment = ? AND workflow_id = ? AND deployment_id = ? LIMIT 1",
      args: [scope.workspace, scope.environment, entry.id, run.deploymentId],
    });
    if (rows.rows[0]) artifact = JSON.parse(String(rows.rows[0].display));
    if (
      scope.environment === "local" &&
      run.attributes?.["gtm.viewer.revision"]
    ) {
      const local = await client.execute({
        sql: "SELECT display FROM gtm_viewer_graphs WHERE workspace = ? AND environment = ? AND workflow_id = ? AND revision = ? LIMIT 1",
        args: [
          scope.workspace,
          scope.environment,
          entry.id,
          run.attributes["gtm.viewer.revision"],
        ],
      });
      if (local.rows[0]) artifact = JSON.parse(String(local.rows[0].display));
    }
  } finally {
    client.close();
  }
  const mapped = artifact ? mapSteps(artifact, detail) : {};
  return {
    run: { ...safeRun(run), input, output, error },
    steps: detail,
    cursor: steps.cursor,
    hasMore: steps.hasMore,
    summary,
    children,
    childrenComplete: childIds.length <= 100,
    graph: artifact?.graph ?? null,
    stages: artifact?.stages ?? [],
    revision: artifact?.revision,
    mapped,
    overlay: artifact ? "available" : "unavailable",
    overlayReason: artifact
      ? undefined
      : "No retained graph matches this run deployment.",
  };
}
function stepLabel(entry: Entry, name: string) {
  const nodes = entry.graph?.nodes.filter((n) => n.data.stepId === name) ?? [];
  return nodes.length === 1 ? nodes[0].data.label : name.split("//").at(-1);
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
    }
    (config as any).rowPolicies = Object.fromEntries(
      entry.sharePolicy!.tables.map((t) => [t.name, t.row]),
    );
  }
  const client = rawClient();
  try {
    return await readData(config, tables, client, url);
  } finally {
    client.close();
  }
}

export async function readBusinessCounts(entry: Entry) {
  if (!entry.data) return undefined;
  const client = rawClient();
  try {
    return await readCounts(entry.data, tables, client);
  } finally {
    client.close();
  }
}
