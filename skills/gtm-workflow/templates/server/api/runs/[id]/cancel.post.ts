import { defineHandler } from "nitro";
import { getRun } from "workflow/api";
import { listChildren } from "../../../../lib/runs-api";
import { bearerOk } from "../../../../lib/sign";
import { rawClient } from "../../../../lib/db";
import { cancelRun } from "../../../../lib/profiles/ledger";

/** Cancel a run and every child run it fanned out; returns the ids that were cancelled. */
export default defineHandler(async (event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  const id = event.context.params?.id ?? "";
  const client=rawClient();
  try {await cancelRun(client,id);} finally {client.close();}
  const children = await listChildren(id);
  await getRun(id).cancel();
  await Promise.all(children.map((childId) => getRun(childId).cancel().catch(() => undefined)));
  return { cancelled: [id, ...children] };
});
