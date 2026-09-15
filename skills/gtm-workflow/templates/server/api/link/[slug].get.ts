import { defineHandler } from "nitro";
import { bearerOk } from "../../../lib/sign";
import { workflows } from "../../../workflows";
export default defineHandler((event) => {
  if (!bearerOk(event.req))
    return new Response("Unauthorized", { status: 401 });
  const slug = event.context.params?.slug ?? "";
  if (!Object.hasOwn(workflows, slug))
    return new Response("Unknown workflow", { status: 404 });
  const url = new URL("/viewer", event.req.url);
  url.searchParams.set("workflow", slug);
  const link = (view: string) => {
    const out = new URL(url);
    out.searchParams.set("view", view);
    return out.href;
  };
  return {
    diagramUrl: link("logic"),
    runsUrl: link("runs"),
    dataUrl: link("data"),
    keys: Object.keys(process.env).filter(
      (k) => k.endsWith("_API_KEY") && process.env[k],
    ),
  };
});
