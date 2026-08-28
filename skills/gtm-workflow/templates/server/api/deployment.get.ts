// gtm-lib v11
import { defineEventHandler } from "nitro/h3";

export default defineEventHandler(async (event) => {
  const secret = process.env.GTM_RUN_SECRET;
  const authorization = event.req.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json(
      { error: { code: "unauthorized", message: "A valid bearer is required." } },
      { status: 401 },
    );
  }

  const head = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!head) {
    return Response.json(
      {
        error: {
          code: "deployment_identity_unavailable",
          message: "The deployment does not expose its Git commit.",
        },
      },
      { status: 503 },
    );
  }

  return Response.json({ head });
});
