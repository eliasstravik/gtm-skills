// gtm-lib v12
import { defineEventHandler } from "nitro/h3";
import { HookNotFoundError } from "workflow/errors";
import { triggerHook } from "../../../../lib/approve";
import { getRunRow, updateRunPlain } from "../../../../lib/db";

export default defineEventHandler(async (event) => {
  const secret = process.env.GTM_RUN_SECRET;
  const authorization = event.req.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return error(401, "unauthorized", "A valid bearer is required.");
  }
  const identifier = event.context.params?.runId;
  if (!identifier) return error(400, "invalid_run", "run id or run key required");

  const row = await getRunRow(identifier);
  if (
    !row ||
    row.finishedAt !== null ||
    row.status !== "waiting" ||
    !row.triggerToken
  ) {
    return error(409, "trigger_not_pending", "trigger is no longer pending");
  }

  try {
    await triggerHook.resume(row.triggerToken, await event.req.json());
    await updateRunPlain(row.runKey, { status: "running", triggerToken: null });
    return Response.json({ accepted: true, runKey: row.runKey });
  } catch (caught) {
    if (HookNotFoundError.is(caught)) {
      return error(409, "trigger_not_pending", "trigger is no longer pending");
    }
    throw caught;
  }
});

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}
