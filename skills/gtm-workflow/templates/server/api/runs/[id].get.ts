import { defineHandler } from "nitro";
import { getRun } from "workflow/api";
import { listApprovals } from "../../../lib/approval-api";
import { bearerOk } from "../../../lib/sign";

/**
 * Read a run: { status, output, error, approvals }. Status is pending, running, completed, failed, or cancelled.
 * approvals lists the run's human-approval requests, pending ones first; decide one with POST /api/runs/<id>/approve.
 */
export default defineHandler(async (event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  const id = event.context.params?.id ?? "";
  const run = getRun(id);
  const status = await run.status;
  const output = status === "completed" ? await run.returnValue : undefined;
  const error = status === "failed" ? await run.returnValue.then(() => undefined, (e: unknown) => String(e)) : undefined;
  const approvals = await listApprovals(id);
  return { status, output, error, approvals };
});
