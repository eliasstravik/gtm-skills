import { defineHandler } from "nitro";
import { start } from "workflow/api";
import { admit } from "../../../lib/intake-api";
import type { Intake } from "../../../lib/intake";
import { workflows } from "../../../workflows";

/** Inbound webhook: verified, deduped, one run per event with the mapped row. No bearer; the sender's signature is the credential. */
export default defineHandler(async (event) => {
  const slug = event.context.params?.slug ?? "";
  const wf = workflows[slug as keyof typeof workflows] as { run: (input: never) => Promise<unknown>; defaultInput: Record<string, unknown>; intake?: Intake<unknown> } | undefined;
  if (!wf?.intake) return new Response(`No intake for ${slug}`, { status: 404 });
  const { row, reply } = await admit(slug, wf.intake, await event.req.text(), event.req.headers);
  if (!row) return Response.json(reply.body, { status: reply.status });
  const run = await start(wf.run as never, [{ ...wf.defaultInput, rows: [row] }] as never);
  return Response.json({ id: run.runId }, { status: 202 });
});
