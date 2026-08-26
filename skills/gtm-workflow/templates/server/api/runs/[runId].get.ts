// gtm-lib v4
import { defineEventHandler } from "nitro/h3";
import { getRun } from "workflow/api";
import { WorkflowRunFailedError } from "workflow/errors";
import { getRunRow, reconcileRun } from "../../../lib/db";

export default defineEventHandler(async (event) => {
  const secret = process.env.GTM_RUN_SECRET;
  const authorization = event.req.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json(
      { error: { code: "unauthorized", message: "A valid bearer is required." } },
      { status: 401 },
    );
  }

  const identifier = event.context.params?.runId;
  if (!identifier) {
    return Response.json(
      { error: { code: "invalid_run", message: "run id or run key required" } },
      { status: 400 },
    );
  }

  let row = await getRunRow(identifier);
  if (!row) {
    return Response.json(
      { error: { code: "not_found", message: `Unknown run ${identifier}` } },
      { status: 404 },
    );
  }
  if (["running", "waiting"].includes(row.status)) {
    row = await reconcileRun(row.runKey);
  }

  const response: Record<string, unknown> = {
    ...row,
    input: JSON.parse(row.input),
    approval: row.approval ? JSON.parse(row.approval) : null,
    webhook_url: row.webhookUrl,
  };
  if (row.status === "completed" && row.runId) {
    const run = getRun(row.runId);
    if (await run.exists) response.result = await run.returnValue;
  } else if (row.status === "failed" && row.runId) {
    const run = getRun(row.runId);
    if (await run.exists) {
      try {
        await run.returnValue;
      } catch (caught) {
        response.error = {
          message: WorkflowRunFailedError.is(caught)
            ? caught.cause instanceof Error
              ? caught.cause.message
              : String(caught.cause)
            : caught instanceof Error
              ? caught.message
              : String(caught),
        };
      }
    }
  }

  return Response.json(response);
});
