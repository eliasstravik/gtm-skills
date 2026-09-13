import { defineHandler } from "nitro";
import { getRun } from "workflow/api";
import { bearerOk } from "../../../../lib/sign";

export default defineHandler(async (event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  await getRun(event.context.params?.id ?? "").cancel();
  return { cancelled: true };
});
