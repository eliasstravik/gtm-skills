// gtm-lib v9
import { defineEventHandler } from "nitro/h3";
import { resumeHook } from "workflow/api";
import { HookNotFoundError } from "workflow/internal/errors";
import { z } from "zod";

const decision = z.object({
  approved: z.boolean(),
  comment: z.string().nullable().default(null),
});

export default defineEventHandler(async (event) => {
  const secret = process.env.GTM_RUN_SECRET;
  const authorization = event.req.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json(
      { error: { code: "unauthorized", message: "A valid bearer is required." } },
      { status: 401 },
    );
  }
  const token = event.context.params?.token;
  if (!token) {
    return Response.json(
      { error: { code: "invalid_token", message: "approval token required" } },
      { status: 400 },
    );
  }

  const parsed = decision.safeParse(await event.req.json());
  if (!parsed.success) {
    return Response.json(
      { error: { code: "invalid_decision", message: parsed.error.message } },
      { status: 400 },
    );
  }
  try {
    await resumeHook(token, parsed.data);
    return Response.json({ approved: parsed.data.approved });
  } catch (caught) {
    if (HookNotFoundError.is(caught)) {
      return Response.json(
        { error: { code: "not_found", message: "approval is no longer pending" } },
        { status: 404 },
      );
    }
    throw caught;
  }
});
