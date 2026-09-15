import { defineHandler } from "nitro";
export default defineHandler((event) => {
  const url = new URL("/viewer", event.req.url);
  url.searchParams.set("workflow", event.context.params?.slug ?? "");
  url.searchParams.set("view", "data");
  return Response.redirect(url, 302);
});
