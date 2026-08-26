import { defineEventHandler } from "nitro/h3";
import { start } from "workflow/api";

export default defineEventHandler(async (event) => {
  const secret = process.env.GTM_RUN_SECRET;
  const authorization = event.req.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const workflowPath = event.context.params?.workflow;
  if (!workflowPath) {
    return new Response("workflow path required", { status: 400 });
  }

  const basename = workflowPath.split("/").at(-1)!;
  const functionName = basename.replace(/-([a-z0-9])/g, (_, character) =>
    character.toUpperCase(),
  );
  const workflowId = `workflow//./workflows/${workflowPath}//${functionName}`;

  if (event.req.method === "GET") {
    const run = await start({ workflowId });
    return Response.json({ runId: run.runId, workflow: workflowPath });
  }

  if (event.req.method === "POST") {
    const body = await event.req.json();
    const run = await start({ workflowId }, [body]);
    return Response.json({ runId: run.runId, workflow: workflowPath });
  }

  return new Response("method not allowed", {
    status: 405,
    headers: { Allow: "GET, POST" },
  });
});
