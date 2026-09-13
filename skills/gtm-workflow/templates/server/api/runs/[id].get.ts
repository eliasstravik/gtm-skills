import { defineHandler } from "nitro";
import { getRun } from "workflow/api";
import { bearerOk } from "../../../lib/sign";

/** Read a run: { status, output, error }. Status is pending, running, completed, failed, or cancelled. */
export default defineHandler(async (event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  const run = getRun(event.context.params?.id ?? "");
  const status = await run.status;
  const output = status === "completed" ? await run.returnValue : undefined;
  const error = status === "failed" ? await run.returnValue.then(() => undefined, (e: unknown) => String(e)) : undefined;
  return { status, output, error };
});
