// gtm-lib v8
import { defineEventHandler } from "nitro/h3";
import { getRun } from "workflow/api";
import { z } from "zod";
import { getRunRow, reconcileRun, updateRunPlain } from "../../../../lib/db";

const decision = z.object({
  reason: z.string().max(500).nullable().default(null),
});

export default defineEventHandler(async (event) => {
  const secret = process.env.GTM_RUN_SECRET;
  const authorization = event.req.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return error(401, "unauthorized", "A valid bearer is required.");
  }

  const identifier = event.context.params?.runId;
  if (!identifier) return error(400, "invalid_run", "run id or run key required");

  const text = await event.req.text();
  const parsed = decision.safeParse(text.trim() === "" ? {} : JSON.parse(text));
  if (!parsed.success) {
    return error(400, "invalid_decision", parsed.error.message);
  }

  let row = await getRunRow(identifier);
  if (!row) return error(404, "not_found", `Unknown run ${identifier}`);
  if (["running", "waiting"].includes(row.status)) {
    row = await reconcileRun(row.runKey);
  }
  if (row.finishedAt !== null || !["running", "waiting"].includes(row.status)) {
    return error(409, "run_not_active", `${row.workflow} is already ${row.status}`, {
      runKey: row.runKey,
      status: row.status,
    });
  }

  if (row.runId) {
    const run = getRun(row.runId);
    if (await run.exists) {
      await run.cancel(
        parsed.data.reason === null ? undefined : { cancelReason: parsed.data.reason },
      );
    }
  }
  await updateRunPlain(row.runKey, {
    status: "cancelled",
    ...(parsed.data.reason === null ? {} : { error: `cancelled: ${parsed.data.reason}` }),
    finishedAt: Date.now(),
  });

  const cancelled = (await getRunRow(row.runKey))!;
  return Response.json({
    ...cancelled,
    input: JSON.parse(cancelled.input),
    approval: cancelled.approval ? JSON.parse(cancelled.approval) : null,
    webhook_url: cancelled.webhookUrl,
  });
});

function error(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return Response.json({ error: { code, message, ...extra } }, { status });
}
