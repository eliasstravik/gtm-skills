import { defineHandler } from "nitro";
import { decideApproval } from "../../../../lib/approval-api";
import { bearerOk } from "../../../../lib/sign";

/** Decide a pending approval: body { token, approved, reason? }. The waiting tool runs on approval or reports the denial to the agent. */
export default defineHandler(async (event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  const id = event.context.params?.id ?? "";
  const body = (await event.req.json().catch(() => ({}))) as { token?: string; approved?: boolean; reason?: string | null };
  if (!body.token || typeof body.approved !== "boolean") return new Response("Body needs token and approved", { status: 400 });
  try {
    return await decideApproval(id, body.token, body.approved, body.reason ?? null);
  } catch (error) {
    return new Response(String(error), { status: 409 });
  }
});
