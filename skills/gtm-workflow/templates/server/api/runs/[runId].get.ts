import { defineEventHandler } from "nitro/h3";
import { getRun } from "workflow/api";
import { WorkflowRunFailedError } from "workflow/errors";

export default defineEventHandler(async (event) => {
  const secret = process.env.GTM_RUN_SECRET;
  const authorization = event.req.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const runId = event.context.params?.runId;
  if (!runId) return new Response("run id required", { status: 400 });

  const run = getRun(runId);
  const status = await run.status;
  const response: {
    runId: string;
    status: string;
    result?: unknown;
    error?: { message: string };
  } = { runId: run.runId, status };

  if (status === "completed") {
    response.result = await run.returnValue;
  } else if (status === "failed") {
    try {
      await run.returnValue;
    } catch (error) {
      // workflow@4.8.4 exposes the original failure on this typed cause.
      response.error = {
        message: WorkflowRunFailedError.is(error)
          ? error.cause.message
          : error instanceof Error
            ? error.message
            : String(error),
      };
    }
  }

  return Response.json(response);
});
