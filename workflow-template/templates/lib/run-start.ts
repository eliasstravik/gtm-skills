import { getWorld } from "workflow/runtime";
import registry from "#viewer-registry";
import { db, lockNames, writeTransaction } from "./db";

/**
 * Starts a run unless one of the same workflow is already pending or running: then `{ runningRunId }`, which the route
 * answers with 409. Cron firing during a manual run, two teammates, the Slack agent and a laptop: one run at a time,
 * so the same rows are never bought twice. Starts of one workflow are serialized on a database lock.
 */
export async function startUnlessRunning(slug: string, begin: () => Promise<{ runId: string }>): Promise<{ runId: string } | { runningRunId: string }> {
  const entry = (registry as { slug: string; workflowName: string }[]).find((e) => e.slug === slug);
  if (!entry) return begin();
  return writeTransaction(db(), async (tx) => {
    await lockNames(tx, [`start:${slug}`]);
    const world = await getWorld();
    for (const status of ["running", "pending"] as const) {
      const page = await world.runs.list({ workflowName: entry.workflowName, status, resolveData: "none", pagination: { limit: 1 } });
      if (page.data[0]) return { runningRunId: page.data[0].runId };
    }
    return begin();
  });
}
