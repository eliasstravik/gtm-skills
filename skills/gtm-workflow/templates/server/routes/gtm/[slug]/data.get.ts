import { defineHandler } from "nitro";
import { tables } from "../../../../db/tables";
import { rawClient } from "../../../../lib/db";
import { dataHeaders, DataInputError, readData, renderData, type WorkflowData } from "../../../../lib/data-api";
import { verifyLink } from "../../../../lib/sign";
import { workflows } from "../../../../workflows";

export default defineHandler(async (event) => {
  const slug = event.context.params?.slug ?? "";
  if (process.env.VERCEL && !verifyLink(`data:${slug}`, event.url.searchParams.get("t"))) {
    return new Response("This data link has expired or is invalid.", { status: 403, headers: dataHeaders });
  }
  const entry = Object.hasOwn(workflows, slug) ? workflows[slug as keyof typeof workflows] : undefined;
  const config = entry && "data" in entry ? entry.data as WorkflowData : undefined;
  if (!config) return new Response("No data view is configured for this workflow.", { status: 404, headers: dataHeaders });
  const client = rawClient();
  try {
    const page = await readData(config, tables, client, event.url);
    return new Response(renderData(page), { headers: dataHeaders });
  } catch (error) {
    if (error instanceof DataInputError) return new Response(error.message, { status: 400, headers: dataHeaders });
    throw error;
  } finally {
    client.close();
  }
});
