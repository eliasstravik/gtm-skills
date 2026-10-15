import { defineHandler } from "nitro";
import { start } from "workflow/api";
import { viewerAttributes } from "../../../lib/viewer-provenance";
import { admit, markStarted, releaseEvent } from "../../../lib/intake-api";
import type { Intake } from "../../../lib/intake";
import { workflows } from "../../../workflows";
import { findWorkflow } from "../../../lib/workflow-registry";

/** Inbound webhook: verified, deduped, one run per event with the mapped row. No bearer; the sender's signature is the credential. */
export default defineHandler(async (event) => {
  const slug = event.context.params?.slug ?? "";
  const wf = findWorkflow(workflows, slug) as
    | {
        run: (input: never) => Promise<unknown>;
        defaultInput: Record<string, unknown>;
        intake?: Intake<unknown>;
      }
    | undefined;
  if (!wf?.intake)
    return new Response(`No intake for ${slug}`, { status: 404 });
  const { row, eventId, reply } = await admit(
    slug,
    wf.intake,
    await event.req.text(),
    event.req.headers,
  );
  if (!row || !eventId) return Response.json(reply.body, { status: reply.status });
  let run;
  try {
    run = await start(
      wf.run as never,
      [{ ...wf.defaultInput, rows: [row] }] as never,
      { attributes: viewerAttributes(slug) },
    );
  } catch (error) {
    await releaseEvent(eventId);
    throw error;
  }
  await markStarted(eventId, run.runId);
  return Response.json({ id: run.runId }, { status: 202 });
});
