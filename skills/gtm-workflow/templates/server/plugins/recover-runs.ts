import { definePlugin } from "nitro";
import { getWorld } from "workflow/runtime";

/**
 * Local only: resume the runs a dev-server reload interrupted. The local queue lives in the dev worker, and every
 * reload (a saved file) replaces that worker, so a run started or running just before it keeps its record (pending
 * or running) but loses the message that would move it on. Nothing picked such a run up again, and it blocked its
 * workflow with already_running until cancelled by hand. So each new worker queues every pending and running run
 * again, which is what the local world's own start() does; that one cannot run here because the bundled world does
 * not know its package version. A run replays from its event log, so one that was not interrupted is unharmed.
 * WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS=false turns it off. On Vercel the platform's queue outlives deployments.
 */
export default definePlugin(() => {
  if (process.env.VERCEL || /^(0|false)$/i.test(process.env.WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS ?? "")) return;
  void resumeActiveRuns().catch((error) => console.error("[gtm] Could not resume the runs a reload interrupted:", error));
});

async function resumeActiveRuns() {
  const world = await getWorld();
  for (const status of ["pending", "running"] as const) {
    let cursor: string | undefined;
    do {
      const page = await world.runs.list({ status, resolveData: "none", pagination: { cursor } });
      for (const run of page.data) await world.queue(`__wkf_workflow_${run.workflowName}`, { runId: run.runId });
      cursor = page.hasMore ? (page.cursor ?? undefined) : undefined;
    } while (cursor);
  }
}
