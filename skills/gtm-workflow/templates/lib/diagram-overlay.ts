// gtm-lib v15
import { executeSelect } from "./db";
import type { DiagramStatus, WorkflowGraph } from "./diagram";

const ACTIVE = new Set(["running", "waiting", "cancelling"]);

function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function overlayRun(graph: WorkflowGraph, runKey: string): Promise<WorkflowGraph> {
  const run = (
    await executeSelect(
      `select run_key, workflow, status, failed_step, started_at, cost_usd, completed, failed from workflow_runs where run_key = ${literal(runKey)} or run_id = ${literal(runKey)} limit 1`,
    )
  )[0];
  if (!run) throw new Error(`Unknown run ${runKey}`);
  const slug = graph.workflow.path.split("/").at(-1);
  // The workflow_mismatch: prefix keeps the CLI's own exit code for this case; the signed route
  // reports every overlay failure as not_found and never surfaces the message.
  if (run.workflow !== slug) {
    throw new Error(`workflow_mismatch: Run ${runKey} belongs to ${String(run.workflow)}, not ${slug}`);
  }
  const ledger = await executeSelect(
    `select step, status, coalesce(sum(cost_usd), 0) as cost_usd from enrichment_runs where run_key = ${literal(String(run.run_key))} and step is not null group by step, status order by step, status`,
  );
  const byStep = new Map<string, { statuses: Set<string>; costUsd: number }>();
  for (const row of ledger) {
    const entry = byStep.get(String(row.step)) ?? { statuses: new Set<string>(), costUsd: 0 };
    entry.statuses.add(String(row.status));
    entry.costUsd += Number(row.cost_usd ?? 0);
    byStep.set(String(row.step), entry);
  }
  const runStatus = String(run.status);
  const failedStep = run.failed_step ? String(run.failed_step) : null;
  const stepOrder = graph.nodes.filter((node) => node.step).map((node) => node.step!);
  const failedIndex = failedStep ? stepOrder.indexOf(failedStep) : -1;
  let reachedFailure = false;
  for (const node of graph.nodes) {
    let status: DiagramStatus = "pending";
    const entry = node.step ? byStep.get(node.step) : undefined;
    if (node.kind === "start") continue;
    else if (node.kind === "end") status = runStatus === "completed" ? "done" : runStatus === "failed" ? "failed" : "pending";
    else if (node.step && (entry?.statuses.has("error") || entry?.statuses.has("lost") || node.step === failedStep)) status = "failed";
    else if (runStatus === "completed") status = "done";
    else if (entry?.statuses.has("pending")) status = "active";
    else if (entry || (failedIndex >= 0 && !reachedFailure)) status = "done";
    else if (ACTIVE.has(runStatus) && node.kind === "step" && !reachedFailure && !entry) status = "active";
    if (node.step === failedStep) reachedFailure = true;
    node.status = status;
    if (entry && node.kind === "step") node.spentUsd = entry.costUsd;
  }
  for (const group of graph.groups) {
    if (group.kind !== "loop") continue;
    group.completed = Number(run.completed ?? 0);
    group.failed = Number(run.failed ?? 0);
  }
  graph.run = {
    runKey: String(run.run_key),
    status: runStatus,
    startedAt: Number(run.started_at ?? 0),
    costUsd: Number(run.cost_usd ?? 0),
    completed: Number(run.completed ?? 0),
    failed: Number(run.failed ?? 0),
  };
  return graph;
}
